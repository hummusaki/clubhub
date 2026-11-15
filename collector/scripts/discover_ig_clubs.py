#!/usr/bin/env python3
"""
Automated Instagram UCSC Student Club Discovery (`collector/scripts/discover_ig_clubs.py`).

Uses an authenticated Instaloader session (if available via IG_SCRAPER_SESSION_B64,
IG_SCRAPER_SESSION_FILE, or `<repo_root>/.ig-session-<user>`) to query Instagram's
mobile user search (`api/v1/users/search/`) across UCSC student-club search queries,
returning raw candidate accounts for `collector/src/update-clubs.js` to filter and merge.

If no authenticated session is configured, exits cleanly with `{"clubs": [], "authenticated": false}`.
"""

import argparse
import base64
import json
import os
import random
import sys
import tempfile
import time
import urllib.parse

DEFAULT_QUERIES = [
    # Independent / recreational / vehicle / snow / outdoor clubs
    "slugs on wheels",
    "slugs on two wheels",
    "santa cruz ski",
    "ucsc ski",
    "ucsc snow",
    "ucsc outdoor",
    "ucsc skate",
    "ucsc surf",
    "ucsc run",
    "ucsc climb",
    "ucsc cycling",
    # General UCSC club & organization patterns
    "ucsc club",
    "ucsc clubs",
    "ucsc team",
    "ucsc society",
    "ucsc association",
    "ucsc council",
    "ucsc senate",
    "ucsc union",
    "ucsc collective",
    "slug club",
    # Engineering, tech, media, arts & campus life
    "ucsc engineering",
    "ucsc robotics",
    "formulaslug",
    "slugbotics",
    "slugsec",
    "cruzhacks",
    "kzsc",
    "city on a hill press",
    "ucsc gaming",
    "ucsc music",
    "ucsc dance",
    "ucsc art",
    "ucsc film",
]


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def load_authenticated_instaloader(session_user: str, session_file: str):
    try:
        import instaloader
    except Exception as exc:
        log(f"  [ig-discover] Instaloader unavailable ({exc}); skipping IG search.")
        return None, None

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

    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    collector_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

    # Auto-detect `.ig-session-*` in repo root if session_user wasn't explicitly set
    if not session_user:
        for folder in (repo_root, collector_root):
            try:
                for fname in os.listdir(folder):
                    if fname.startswith(".ig-session-") and len(fname) > len(".ig-session-"):
                        session_user = fname[len(".ig-session-"):]
                        break
            except OSError:
                pass
            if session_user:
                break

    if not session_user:
        return None, None

    temp_session_path = None
    try:
        auto_candidates = [
            session_file,
            os.path.join(repo_root, f".ig-session-{session_user}"),
            os.path.join(collector_root, f".ig-session-{session_user}"),
        ]
        resolved_file = next((p for p in auto_candidates if p and os.path.isfile(p)), "")
        session_b64 = os.environ.get("IG_SCRAPER_SESSION_B64", "").strip()

        if session_b64:
            raw_bytes = base64.b64decode(session_b64)
            fd, temp_session_path = tempfile.mkstemp(prefix="ig_disc_")
            with os.fdopen(fd, "wb") as f:
                f.write(raw_bytes)
            L.load_session_from_file(session_user, filename=temp_session_path)
        elif resolved_file:
            L.load_session_from_file(session_user, filename=resolved_file)
        else:
            L.load_session_from_file(session_user)

        cdict = L.context._session.cookies.get_dict()
        if not cdict.get("sessionid"):
            return None, temp_session_path
        if "%" in cdict["sessionid"]:
            cdict["sessionid"] = urllib.parse.unquote(cdict["sessionid"])
            L.load_session(session_user, cdict)
        return L, temp_session_path
    except Exception as exc:
        log(f"  [ig-discover] Could not load session for @{session_user} ({exc}); skipping IG search.")
        return None, temp_session_path


def main() -> int:
    parser = argparse.ArgumentParser(description="Discover UCSC clubs via Instagram mobile search")
    parser.add_argument("--session-user", type=str, default=os.environ.get("IG_SCRAPER_SESSION_USER", ""))
    parser.add_argument("--session-file", type=str, default=os.environ.get("IG_SCRAPER_SESSION_FILE", ""))
    parser.add_argument("--delay", type=float, default=0.45, help="Delay between search queries (sec)")
    parser.add_argument("--max-seconds", type=float, default=165.0, help="Graceful time budget before returning results")
    parser.add_argument("--query", action="append", dest="queries", help="Custom query (repeatable)")
    args = parser.parse_args()

    queries = args.queries if args.queries else DEFAULT_QUERIES
    L, temp_session_path = load_authenticated_instaloader(args.session_user.strip(), args.session_file.strip())
    if L is None:
        print(json.dumps({"clubs": [], "authenticated": False}))
        return 0

    by_username: dict[str, dict] = {}
    consecutive_errors = 0
    started_at = time.monotonic()

    try:
        for idx, query in enumerate(queries):
            if time.monotonic() - started_at >= args.max_seconds:
                log(f"  [ig-discover] Reached {args.max_seconds:.0f}s budget after {idx}/{len(queries)} queries; returning {len(by_username)} accounts.")
                break
            if idx > 0 and args.delay > 0:
                time.sleep(args.delay * random.uniform(0.85, 1.2))
            try:
                data = L.context.get_iphone_json("api/v1/users/search/", {"q": query, "count": "50"})
                consecutive_errors = 0
                for u in (data.get("users") or []):
                    uname = (u.get("username") or "").strip().lower()
                    if not uname or uname in by_username:
                        continue
                    by_username[uname] = {
                        "username": uname,
                        "full_name": (u.get("full_name") or "").strip(),
                        "is_private": bool(u.get("is_private")),
                        "is_verified": bool(u.get("is_verified")),
                        "profile_pic_url": u.get("profile_pic_url") or None,
                        "matched_query": query,
                    }
            except Exception as exc:
                consecutive_errors += 1
                log(f"  [ig-discover] Query '{query}' error: {exc}")
                if consecutive_errors >= 3:
                    log("  [ig-discover] Stopping search early due to rate limit / connection errors.")
                    break
    finally:
        if temp_session_path and os.path.exists(temp_session_path):
            try:
                os.remove(temp_session_path)
            except OSError:
                pass

    print(json.dumps({"clubs": list(by_username.values()), "authenticated": True}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
