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


def fetch_via_web_profile_info(sess: requests.Session, handle: str, limit: int) -> dict | None:
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
    resp = sess.get(url, headers=headers, timeout=12)
    if not resp.ok:
        return None

    payload = resp.json()
    user = (payload.get("data") or {}).get("user")
    if not user:
        return None

    if user.get("is_private"):
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
    resp = sess.get(url, headers={"User-Agent": BROWSER_UA, "Accept-Language": "en-US,en;q=0.9"}, timeout=10)
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
    resp = sess.get(url, headers={"User-Agent": BROWSER_UA, "Accept-Language": "en-US,en;q=0.9"}, timeout=12)
    if resp.status_code == 404:
        raise LookupError(f"@{handle}: account not found")
    if not resp.ok:
        return None
    html = resp.text

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

    # HTML link scan fallback inside /embed/
    shortcodes = []
    for m in re.finditer(r'instagram\.com/(?:[^/"\']+/ )?(?:p|reel)/([A-Za-z0-9_-]{8,15})/', html.replace("\\/", "/")):
        sc = m.group(1)
        if sc not in shortcodes:
            shortcodes.append(sc)

    if not shortcodes:
        return None

    name_match = re.search(r'<span[^>]+class="[^"]*Title[^"]*"[^>]*>([\s\S]*?)</span>', html, re.I)
    full_name = strip_html(name_match.group(1)) if name_match else handle

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

    # Optional authenticated Instaloader session (only used if logged in!)
    L = None
    logged_in = False
    temp_session_path = None

    if args.session_user:
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
            logged_in = True
            log(f"  [scraper] Loaded authenticated session for @{args.session_user}")
        except Exception as exc:
            log(f"  [scraper] Could not load authenticated session ({exc}); using public web/embed scraper.")

    http_sess = requests.Session()
    results = []
    errors = []
    consecutive_blocks = 0

    try:
        for idx, handle in enumerate(handles):
            if idx > 0 and args.delay > 0:
                time.sleep(args.delay * random.uniform(0.8, 1.25))

            log(f"  [scraper] ({idx + 1}/{len(handles)}) Fetching @{handle}...")
            club_data = None

            try:
                # Layer 1: Authenticated Instaloader (if burner session configured)
                if logged_in and L is not None:
                    import instaloader
                    profile = instaloader.Profile.from_username(L.context, handle)
                    if profile.is_private and not profile.followed_by_viewer:
                        raise PermissionError(f"@{handle}: account is private")
                    posts_out = []
                    for c_idx, post in enumerate(profile.get_posts()):
                        if c_idx >= args.limit:
                            break
                        posts_out.append({
                            "id": f"ig_{post.shortcode}",
                            "caption": post.caption or "",
                            "postedAt": post.date_utc.replace(tzinfo=datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
                            "permalink": f"https://www.instagram.com/p/{post.shortcode}/",
                            "mediaType": "VIDEO" if post.is_video else "IMAGE",
                            "imageUrl": post.url or None,
                            "isStory": False,
                        })
                    if args.stories:
                        try:
                            for story in L.get_stories(userids=[profile.userid]):
                                for item in story.get_items():
                                    posts_out.append({
                                        "id": f"ig_story_{item.mediaid}",
                                        "caption": item.caption or "",
                                        "postedAt": item.date_utc.replace(tzinfo=datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
                                        "permalink": f"https://www.instagram.com/stories/{profile.username}/{item.mediaid}/",
                                        "mediaType": "STORY_VIDEO" if item.is_video else "STORY_IMAGE",
                                        "imageUrl": item.url or None,
                                        "isStory": True,
                                    })
                        except Exception as s_exc:
                            log(f"  [scraper] Warning: stories unavailable for @{handle}: {s_exc}")

                    club_data = {
                        "handle": handle,
                        "profile": {
                            "username": profile.username,
                            "name": profile.full_name or profile.username,
                            "biography": profile.biography or "",
                            "website": profile.external_url or None,
                            "profilePictureUrl": profile.profile_pic_url or None,
                            "followers": profile.followers,
                            "mediaCount": profile.mediacount,
                        },
                        "posts": posts_out,
                    }

                # Layer 2: Modern browser-header web_profile_info JSON (no login needed!)
                if club_data is None:
                    club_data = fetch_via_web_profile_info(http_sess, handle, args.limit)

                # Layer 3: Public Instagram iframe /embed/ fallback (resilient on cloud/CI IPs!)
                if club_data is None:
                    club_data = fetch_via_public_embed(http_sess, handle, args.limit)

                if club_data is not None:
                    consecutive_blocks = 0
                    results.append(club_data)
                else:
                    consecutive_blocks += 1
                    errors.append({
                        "club": handle,
                        "message": f"@{handle}: temporarily rate-limited by Instagram",
                    })
                    if consecutive_blocks >= 3:
                        log("  [scraper] Rate limit reached on this IP; stopping batch early and keeping collected profiles.")
                        break

            except (LookupError, PermissionError) as known_exc:
                consecutive_blocks = 0
                errors.append({"club": handle, "message": str(known_exc)})
            except Exception as exc:
                consecutive_blocks += 1
                errors.append({"club": handle, "message": f"@{handle}: {exc}"})
                if consecutive_blocks >= 3:
                    log("  [scraper] Stopping batch early after repeated connection errors.")
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
