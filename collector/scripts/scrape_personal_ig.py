#!/usr/bin/env python3
"""
Multi-layer public Instagram scraper for UCSC clubs (works on personal & business accounts).

Waterfall strategy per club:
  1. Authenticated Instaloader session (if --session-user / IG_SCRAPER_SESSION_B64 is provided;
     also enables active 24h Stories when --stories is passed).
  2. Public Web Profile JSON endpoint (`web_profile_info` with modern browser headers; grabs
     bio, `bio_links`, followers, and recent 12 posts + captions in 1 request, no login needed).
  3. Public Instagram Embed HTML fallback (`/handle/embed/` + `/p/shortcode/embed/captioned/`;
     works without login even when GraphQL/API endpoints are rate-limited on cloud/CI IPs).
"""

import argparse
import base64
import datetime
import html as html_lib
import json
import os
import random
import re
import sys
import tempfile
import time
import urllib.parse

import requests

BROWSER_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def ts_to_iso(ts: int | float) -> str:
    return (
        datetime.datetime.fromtimestamp(float(ts), tz=datetime.timezone.utc)
        .isoformat()
        .replace("+00:00", "Z")
    )


def strip_html(raw: str) -> str:
    text = re.sub(r"<br\s*/?>", "\n", raw, flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)
    return html_lib.unescape(text).strip()


EMBED_HEADERS = {
    "User-Agent": BROWSER_UA,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://getinvolved.ucsc.edu/",
    "Sec-Fetch-Dest": "iframe",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "cross-site",
}


def fetch_via_web_profile_info(sess: requests.Session, handle: str, limit: int, fetch_stories: bool = False) -> dict | None:
    url = f"https://www.instagram.com/api/v1/users/web_profile_info/?username={handle}"
    headers = {
        "User-Agent": BROWSER_UA,
        "X-IG-App-ID": "936619743392459",
        "X-ASBD-ID": "129477",
        "X-Requested-With": "XMLHttpRequest",
        "Accept": "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": f"https://www.instagram.com/{handle}/",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
    }
    resp = sess.get(url, headers=headers, timeout=12, allow_redirects=False)
    if resp.status_code == 404:
        raise LookupError(f"@{handle}: account not found")
    if not resp.ok or "application/json" not in resp.headers.get("content-type", ""):
        return None

    payload = resp.json()
    data_obj = payload.get("data")
    if isinstance(data_obj, dict) and "user" in data_obj and data_obj["user"] is None:
        raise LookupError(f"@{handle}: account not found")
    user = (data_obj or {}).get("user") if isinstance(data_obj, dict) else None
    if not user:
        return None

    if user.get("is_private") and not user.get("followed_by_viewer"):
        raise PermissionError(f"@{handle}: account is private")

    # Prefer external_url, or first link in bio_links
    website = user.get("external_url")
    bio_links = user.get("bio_links") or []
    if not website and bio_links:
        website = bio_links[0].get("url")

    edges = ((user.get("edge_owner_to_timeline_media") or {}).get("edges")) or []
    posts_out = []
    for edge in edges[:limit]:
        node = edge.get("node") or {}
        shortcode = node.get("shortcode")
        if not shortcode:
            continue
        cap_edges = ((node.get("edge_media_to_caption") or {}).get("edges")) or []
        caption = (cap_edges[0].get("node") or {}).get("text", "") if cap_edges else ""
        taken_at = node.get("taken_at_timestamp")
        posted_iso = ts_to_iso(taken_at) if taken_at else datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")
        typename = node.get("__typename") or ""
        media_type = (
            "VIDEO"
            if node.get("is_video")
            else ("CAROUSEL_ALBUM" if "Sidecar" in typename else "IMAGE")
        )
        posts_out.append({
            "id": f"ig_{shortcode}",
            "caption": caption or "",
            "postedAt": posted_iso,
            "permalink": f"https://www.instagram.com/p/{shortcode}/",
            "mediaType": media_type,
            "imageUrl": node.get("display_url") or node.get("thumbnail_src") or None,
            "isStory": False,
        })

    # Optional active 24h Stories fetch via authenticated web reels_media endpoint
    user_id = user.get("id")
    if fetch_stories and user_id:
        try:
            s_resp = sess.get(
                f"https://www.instagram.com/api/v1/feed/reels_media/?reel_ids={user_id}",
                headers=headers,
                timeout=10,
                allow_redirects=False,
            )
            if s_resp.ok and "application/json" in s_resp.headers.get("content-type", ""):
                reels = (s_resp.json() or {}).get("reels_media") or []
                for reel in reels:
                    for item in (reel.get("items") or []):
                        pk = item.get("pk") or item.get("id")
                        if not pk:
                            continue
                        taken_at = item.get("taken_at")
                        cap_obj = item.get("caption") or {}
                        story_caption = cap_obj.get("text", "") if isinstance(cap_obj, dict) else ""
                        candidates = ((item.get("image_versions2") or {}).get("candidates")) or []
                        img_url = candidates[0].get("url") if candidates else None
                        is_vid = item.get("media_type") == 2
                        posts_out.append({
                            "id": f"ig_story_{pk}",
                            "caption": story_caption,
                            "postedAt": ts_to_iso(taken_at) if taken_at else datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
                            "permalink": f"https://www.instagram.com/stories/{user.get('username') or handle}/{pk}/",
                            "mediaType": "STORY_VIDEO" if is_vid else "STORY_IMAGE",
                            "imageUrl": img_url,
                            "isStory": True,
                        })
        except Exception as s_exc:
            log(f"  [scraper] Stories note for @{handle}: {s_exc}")

    return {
        "handle": handle,
        "profile": {
            "username": user.get("username") or handle,
            "name": user.get("full_name") or user.get("username") or handle,
            "biography": user.get("biography") or "",
            "website": website or None,
            "extraBioLinks": [b.get("url") for b in bio_links if b.get("url")],
            "profilePictureUrl": user.get("profile_pic_url_hd") or user.get("profile_pic_url") or None,
            "followers": (user.get("edge_followed_by") or {}).get("count"),
            "mediaCount": (user.get("edge_owner_to_timeline_media") or {}).get("count"),
        },
        "posts": posts_out,
    }


def fetch_post_caption_from_embed(sess: requests.Session, shortcode: str) -> dict | None:
    url = f"https://www.instagram.com/p/{shortcode}/embed/captioned/"
    resp = sess.get(url, headers=EMBED_HEADERS, timeout=10)
    if not resp.ok:
        return None
    html = resp.text

    caption = ""
    cap_match = re.search(r'<div[^>]+class="[^"]*Caption[^"]*"[^>]*>([\s\S]*?)</div>', html, re.I)
    if cap_match:
        body = cap_match.group(1)
        # Remove username prefix link & "View all comments" footer inside Caption div
        body = re.sub(r'<a[^>]+class="[^"]*CaptionUsername[^"]*"[^>]*>[\s\S]*?</a>', "", body, flags=re.I)
        body = re.sub(r'<div[^>]+class="[^"]*CaptionComments[^"]*"[^>]*>[\s\S]*?</div>', "", body, flags=re.I)
        caption = strip_html(body)

    img_url = None
    img_match = re.search(r'<img[^>]+class="[^"]*EmbeddedMediaImage[^"]*"[^>]+src="([^"]+)"', html, re.I)
    if img_match:
        img_url = html_lib.unescape(img_match.group(1))

    posted_iso = None
    time_match = re.search(r'<time[^>]+datetime="([^"]+)"', html, re.I)
    if time_match:
        posted_iso = time_match.group(1)
    else:
        ts_match = re.search(r'"taken_at_timestamp"\s*:\s*(\d{9,11})', html)
        if ts_match:
            posted_iso = ts_to_iso(int(ts_match.group(1)))

    return {
        "caption": caption,
        "imageUrl": img_url,
        "postedAt": posted_iso or datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
    }


def fetch_via_public_embed(sess: requests.Session, handle: str, limit: int) -> dict | None:
    url = f"https://www.instagram.com/{handle}/embed/"
    resp = sess.get(url, headers=EMBED_HEADERS, timeout=12, allow_redirects=True)
    if resp.status_code == 404:
        raise LookupError(f"@{handle}: account not found")
    if not resp.ok:
        return None
    if "/accounts/login" in (resp.url or ""):
        return None
    html = resp.text

    if (
        "Profile isn&#039;t available" in html
        or "Profile isn't available" in html
        or "Sorry, this page isn&#039;t available" in html
        or "Sorry, this page isn't available" in html
        or "The link may be broken, or the profile may have been removed" in html
    ):
        raise LookupError(f"@{handle}: account not found")

    if "This Account is Private" in html or '"is_private":true' in html:
        raise PermissionError(f"@{handle}: account is private")

    # Try parsing contextJSON if embedded
    ctx_match = re.search(r'"contextJSON"\s*:\s*"((?:\\.|[^"\\])*)"', html)
    if ctx_match:
        try:
            ctx_raw = json.loads(f'"{ctx_match.group(1)}"')
            ctx = json.loads(ctx_raw)
            context_data = ctx.get("context") or {}
            graphql_user = (ctx.get("gql_data") or {}).get("user") or {}
            edges = ((graphql_user.get("edge_owner_to_timeline_media") or {}).get("edges")) or []

            posts_out = []
            for edge in edges[:limit]:
                node = edge.get("node") or {}
                shortcode = node.get("shortcode")
                if not shortcode:
                    continue
                cap_edges = ((node.get("edge_media_to_caption") or {}).get("edges")) or []
                caption = (cap_edges[0].get("node") or {}).get("text", "") if cap_edges else ""
                taken_at = node.get("taken_at_timestamp")
                image_url = node.get("display_url") or node.get("thumbnail_src")

                # If contextJSON omitted captions on profile grid, fetch post embed caption
                if not caption:
                    extra = fetch_post_caption_from_embed(sess, shortcode)
                    if extra:
                        caption = extra["caption"] or caption
                        image_url = image_url or extra["imageUrl"]
                    time.sleep(0.35)

                posts_out.append({
                    "id": f"ig_{shortcode}",
                    "caption": caption or "",
                    "postedAt": ts_to_iso(taken_at) if taken_at else datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
                    "permalink": f"https://www.instagram.com/p/{shortcode}/",
                    "mediaType": "VIDEO" if node.get("is_video") else "IMAGE",
                    "imageUrl": image_url,
                    "isStory": False,
                })

            username = graphql_user.get("username") or context_data.get("username") or handle
            if posts_out or graphql_user.get("id") or context_data.get("username"):
                return {
                    "handle": handle,
                    "profile": {
                        "username": username,
                        "name": graphql_user.get("full_name") or context_data.get("full_name") or username,
                        "biography": graphql_user.get("biography") or "",
                        "website": graphql_user.get("external_url") or None,
                        "profilePictureUrl": graphql_user.get("profile_pic_url") or None,
                        "followers": (graphql_user.get("edge_followed_by") or {}).get("count") or context_data.get("followers_count"),
                        "mediaCount": (graphql_user.get("edge_owner_to_timeline_media") or {}).get("count"),
                    },
                    "posts": posts_out,
                }
        except Exception:
            pass

    # HTML link & JSON shortcode scan fallback inside /embed/
    unescaped_html = html.replace("\\/", "/")
    shortcodes = []
    for pat in (
        r'"shortcode"\s*:\s*"([A-Za-z0-9_-]{8,15})"',
        r'/(?:p|reel)/([A-Za-z0-9_-]{8,15})/',
    ):
        for m in re.finditer(pat, unescaped_html):
            sc = m.group(1)
            if sc not in shortcodes:
                shortcodes.append(sc)

    name_match = re.search(r'<span[^>]+class="[^"]*Title[^"]*"[^>]*>([\s\S]*?)</span>', html, re.I)
    full_name = strip_html(name_match.group(1)) if name_match else handle

    if not shortcodes:
        # Valid 0-post public profile embed (renders profile header without login wall)
        if name_match and "login" not in html[:1500].lower():
            return {
                "handle": handle,
                "profile": {
                    "username": handle,
                    "name": full_name or handle,
                    "biography": "",
                    "website": None,
                    "profilePictureUrl": None,
                    "followers": None,
                    "mediaCount": 0,
                },
                "posts": [],
            }
        return None

    posts_out = []
    for sc in shortcodes[: min(limit, 6)]:
        extra = fetch_post_caption_from_embed(sess, sc)
        if extra:
            posts_out.append({
                "id": f"ig_{sc}",
                "caption": extra["caption"] or "",
                "postedAt": extra["postedAt"],
                "permalink": f"https://www.instagram.com/p/{sc}/",
                "mediaType": "IMAGE",
                "imageUrl": extra["imageUrl"],
                "isStory": False,
            })
        time.sleep(0.4)

    return {
        "handle": handle,
        "profile": {
            "username": handle,
            "name": full_name or handle,
            "biography": "",
            "website": None,
            "profilePictureUrl": None,
            "followers": None,
            "mediaCount": len(posts_out),
        },
        "posts": posts_out,
    }


def _extract_item_image(item: dict) -> str | None:
    if item.get("display_uri"):
        return item["display_uri"]
    if item.get("display_url"):
        return item["display_url"]
    candidates = ((item.get("image_versions2") or {}).get("candidates")) or []
    if candidates and candidates[0].get("url"):
        return candidates[0]["url"]
    carousel = item.get("carousel_media") or []
    if carousel:
        c_cand = ((carousel[0].get("image_versions2") or {}).get("candidates")) or []
        if c_cand and c_cand[0].get("url"):
            return c_cand[0]["url"]
    return item.get("thumbnail_src") or None


def fetch_via_page_and_mobile(
    L,
    handle: str,
    limit: int,
    logged_in: bool = False,
    fetch_stories: bool = False,
) -> dict | None:
    """
    Primary personal-account scraper:
      1. Loads embedded `xig_user_by_username` + `polaris_ordered_timeline_connection` from
         Instagram's HTML document navigation (`get_page_data`) — zero `/graphql/query` calls!
      2. When logged in, enriches via mobile `Bearer IGT:2:` (`api/v1/feed/user/{pk}/`) for
         exact post timestamps/carousels and `api/v1/feed/reels_media/` for active 24h Stories.
    """
    import instaloader

    try:
        page = L.context.get_page_data(f"{handle.lower()}/")
    except instaloader.exceptions.QueryReturnedNotFoundException:
        raise LookupError(f"@{handle}: account not found")
    except Exception:
        return None

    user: dict = {}
    for block in page:
        xig = block.get("xig_user_by_username")
        if isinstance(xig, dict):
            for k, v in xig.items():
                if v is not None:
                    user[k] = v

    pk = user.get("pk")
    if not pk:
        return None

    if user.get("is_private") and not user.get("followed_by_viewer"):
        raise PermissionError(f"@{handle}: account is private")

    bio_links = user.get("bio_links") or []
    extra_links = [b.get("url") for b in bio_links if isinstance(b, dict) and b.get("url")]
    website = user.get("external_url") or (extra_links[0] if extra_links else None)
    username = user.get("username") or handle

    posts_out = []

    # Enrich posts via mobile API (`Bearer IGT:2:`) when logged in for exact timestamps & carousels
    if logged_in:
        try:
            feed = L.context.get_iphone_json(f"api/v1/feed/user/{pk}/", {"count": str(limit)})
            for item in (feed.get("items") or [])[:limit]:
                code = item.get("code")
                if not code:
                    continue
                cap_obj = item.get("caption")
                caption = cap_obj.get("text", "") if isinstance(cap_obj, dict) else ""
                taken_at = item.get("taken_at")
                mtype_num = item.get("media_type")
                media_type = "VIDEO" if mtype_num == 2 else ("CAROUSEL_ALBUM" if mtype_num == 8 else "IMAGE")
                posts_out.append({
                    "id": f"ig_{code}",
                    "caption": caption or "",
                    "postedAt": ts_to_iso(taken_at) if taken_at else datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
                    "permalink": f"https://www.instagram.com/p/{code}/",
                    "mediaType": media_type,
                    "imageUrl": _extract_item_image(item),
                    "isStory": False,
                })
        except Exception as m_exc:
            log(f"  [scraper] Mobile feed note for @{handle}: {m_exc}")

    # Fallback to timeline posts already embedded in the HTML page (works even logged-out!)
    if not posts_out:
        tl = user.get("polaris_ordered_timeline_connection") or user.get("edge_owner_to_timeline_media") or {}
        for edge in (tl.get("edges") or [])[:limit]:
            node = edge.get("node") if isinstance(edge, dict) and "node" in edge else edge
            if not isinstance(node, dict):
                continue
            code = node.get("code") or node.get("shortcode")
            if not code:
                continue
            cap_obj = node.get("caption")
            if isinstance(cap_obj, dict):
                caption = cap_obj.get("text", "")
            else:
                cap_edges = ((node.get("edge_media_to_caption") or {}).get("edges")) or []
                caption = (cap_edges[0].get("node") or {}).get("text", "") if cap_edges else ""
            taken_at = node.get("taken_at") or node.get("taken_at_timestamp")
            mtype_num = node.get("media_type")
            media_type = "VIDEO" if (mtype_num == 2 or node.get("is_video")) else ("CAROUSEL_ALBUM" if mtype_num == 8 else "IMAGE")
            posts_out.append({
                "id": f"ig_{code}",
                "caption": caption or "",
                "postedAt": ts_to_iso(taken_at) if taken_at else datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
                "permalink": f"https://www.instagram.com/p/{code}/",
                "mediaType": media_type,
                "imageUrl": _extract_item_image(node),
                "isStory": False,
            })

    # Active 24h Stories — only query reels_media when `latest_reel_media` indicates an active story!
    if fetch_stories and logged_in and user.get("latest_reel_media"):
        try:
            stories = L.context.get_iphone_json("api/v1/feed/reels_media/", {"reel_ids": str(pk)})
            for reel in (stories.get("reels_media") or []):
                for item in (reel.get("items") or []):
                    item_pk = item.get("pk") or item.get("id")
                    if not item_pk:
                        continue
                    taken_at = item.get("taken_at")
                    cap_obj = item.get("caption")
                    story_caption = cap_obj.get("text", "") if isinstance(cap_obj, dict) else ""
                    is_vid = item.get("media_type") == 2
                    posts_out.append({
                        "id": f"ig_story_{item_pk}",
                        "caption": story_caption,
                        "postedAt": ts_to_iso(taken_at) if taken_at else datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
                        "permalink": f"https://www.instagram.com/stories/{username}/{item_pk}/",
                        "mediaType": "STORY_VIDEO" if is_vid else "STORY_IMAGE",
                        "imageUrl": _extract_item_image(item),
                        "isStory": True,
                    })
        except Exception as s_exc:
            log(f"  [scraper] Stories note for @{handle}: {s_exc}")

    followers = user.get("follower_count")
    if followers is None:
        followers = (user.get("edge_followed_by") or {}).get("count")

    return {
        "handle": handle,
        "profile": {
            "username": username,
            "name": user.get("full_name") or username,
            "biography": user.get("biography") or "",
            "website": website or None,
            "extraBioLinks": extra_links,
            "profilePictureUrl": user.get("profile_pic_url_hd") or user.get("profile_pic_url") or None,
            "followers": followers,
            "mediaCount": (user.get("edge_owner_to_timeline_media") or {}).get("count") or len(posts_out),
        },
        "posts": posts_out,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Scrape public Instagram club profiles (personal & business)")
    parser.add_argument("handles", nargs="*", help="Instagram handles to fetch")
    parser.add_argument("--limit", type=int, default=8, help="Max recent posts per club (default: 8)")
    parser.add_argument("--max-clubs", type=int, default=int(os.environ.get("IG_SCRAPER_MAX_CLUBS", "0")),
                        help="Max clubs to attempt in one run (0 = all)")
    parser.add_argument("--delay", type=float, default=float(os.environ.get("IG_SCRAPER_DELAY_SEC", "4")),
                        help="Base delay in seconds between clubs (default: 4s)")
    parser.add_argument("--session-user", type=str, default=os.environ.get("IG_SCRAPER_SESSION_USER", ""),
                        help="Optional burner Instagram username with a saved Instaloader session")
    parser.add_argument("--session-file", type=str, default=os.environ.get("IG_SCRAPER_SESSION_FILE", ""),
                        help="Optional explicit path to saved Instaloader session file")
    parser.add_argument("--stories", action="store_true",
                        default=os.environ.get("IG_SCRAPER_STORIES", "").lower() in ("1", "true", "yes"),
                        help="Also fetch active 24h stories (requires logged-in burner session)")
    args = parser.parse_args()

    handles = [h.strip().lstrip("@") for h in args.handles if h.strip().lstrip("@")]
    if args.max_clubs and args.max_clubs > 0:
        handles = handles[:args.max_clubs]

    if not handles:
        print(json.dumps({"results": [], "errors": []}))
        return 0

    # Initialize Instaloader context (used for anonymous embedded page extraction AND optional mobile API)
    L = None
    logged_in = False
    temp_session_path = None

    try:
        import instaloader
        L = instaloader.Instaloader(
            download_pictures=False,
            download_videos=False,
            download_video_thumbnails=False,
            download_geotags=False,
            download_comments=False,
            save_metadata=False,
            compress_json=False,
            quiet=True,
            max_connection_attempts=1,
        )
    except Exception:
        L = None

    if args.session_user and L is not None:
        try:
            session_b64 = os.environ.get("IG_SCRAPER_SESSION_B64", "").strip()
            if session_b64:
                raw_bytes = base64.b64decode(session_b64)
                fd, temp_session_path = tempfile.mkstemp(prefix="ig_sess_")
                with os.fdopen(fd, "wb") as f:
                    f.write(raw_bytes)
                L.load_session_from_file(args.session_user, filename=temp_session_path)
            elif args.session_file:
                L.load_session_from_file(args.session_user, filename=args.session_file)
            else:
                L.load_session_from_file(args.session_user)

            # Ensure sessionid is unquoted so Instaloader's `Bearer IGT:2:` mobile token works cleanly
            cdict = L.context._session.cookies.get_dict()
            if cdict.get("sessionid") and "%" in cdict["sessionid"]:
                cdict["sessionid"] = urllib.parse.unquote(cdict["sessionid"])
                L.load_session(args.session_user, cdict)

            logged_in = True
            log(f"  [scraper] Loaded authenticated session for @{args.session_user}")
        except Exception as exc:
            log(f"  [scraper] Could not load authenticated session ({exc}); using public web/embed scraper.")

    http_sess = requests.Session()
    # Clean cookie-free session for public /embed/ iframe fallback so challenged session cookies never block Layer 3
    embed_sess = requests.Session()
    if logged_in and L is not None:
        saved_cookies = L.context._session.cookies.get_dict()
        for ck, cv in saved_cookies.items():
            if cv:
                http_sess.cookies.set(ck, cv, domain=".instagram.com", path="/")
        if saved_cookies.get("csrftoken"):
            http_sess.headers.update({"X-CSRFToken": saved_cookies["csrftoken"]})
    results = []
    errors = []
    consecutive_blocks = 0
    page_layer_blocks = 0
    web_layer_blocks = 0

    try:
        for idx, handle in enumerate(handles):
            if idx > 0 and args.delay > 0:
                time.sleep(args.delay * random.uniform(0.85, 1.3))

            log(f"  [scraper] ({idx + 1}/{len(handles)}) Fetching @{handle}...")
            club_data = None

            try:
                # Layer 1: Embedded page data + mobile Bearer IGT:2: feed & 24h Stories (zero /graphql/query!)
                if L is not None and page_layer_blocks < 2:
                    club_data = fetch_via_page_and_mobile(
                        L,
                        handle,
                        args.limit,
                        logged_in=logged_in,
                        fetch_stories=bool(args.stories and logged_in),
                    )
                    if club_data is None:
                        page_layer_blocks += 1
                    else:
                        page_layer_blocks = 0

                # Layer 2: web_profile_info JSON fallback
                if club_data is None and web_layer_blocks < 2:
                    club_data = fetch_via_web_profile_info(
                        http_sess,
                        handle,
                        args.limit,
                        fetch_stories=bool(args.stories and logged_in),
                    )
                    if club_data is None:
                        web_layer_blocks += 1
                    else:
                        web_layer_blocks = 0

                # Layer 3: Public Instagram iframe /embed/ fallback (cookie-free cross-site iframe request)
                if club_data is None:
                    club_data = fetch_via_public_embed(embed_sess, handle, args.limit)

                if club_data is not None:
                    consecutive_blocks = 0
                    results.append(club_data)
                else:
                    consecutive_blocks += 1
                    errors.append({
                        "club": handle,
                        "message": f"@{handle}: temporarily rate-limited by Instagram",
                        "rateLimited": True,
                    })
                    if consecutive_blocks >= 2:
                        log("  [scraper] Rate limit reached on this IP; stopping batch early and keeping collected profiles.")
                        break

            except (LookupError, PermissionError) as known_exc:
                consecutive_blocks = 0
                errors.append({"club": handle, "message": str(known_exc), "rateLimited": False})
            except Exception as exc:
                consecutive_blocks += 1
                is_rl = bool(re.search(r"429|rate.?limit|wait a few minutes|too many requests", str(exc), re.I))
                errors.append({"club": handle, "message": f"@{handle}: {exc}", "rateLimited": is_rl})
                if consecutive_blocks >= 2:
                    log("  [scraper] Stopping batch early after repeated connection/rate-limit errors.")
                    break
    finally:
        if temp_session_path and os.path.exists(temp_session_path):
            try:
                os.remove(temp_session_path)
            except OSError:
                pass

    print(json.dumps({"results": results, "errors": errors}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
