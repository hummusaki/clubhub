#!/usr/bin/env python3
"""
One-time Instagram session setup helper for a disposable/burner Instagram account.

Supports TWO modes:
  Mode A (Recommended — avoids Instagram "Checkpoint required" errors!):
    1. Log into https://www.instagram.com in your normal browser (Chrome/Safari/Firefox)
       and complete any "Verify it's you" prompt there.
    2. Open DevTools -> Application (or Storage) -> Cookies -> https://www.instagram.com
       and copy the value of the `sessionid` cookie.
    3. Run:
         npm run ig:login -- YOUR_BURNER_USERNAME --sessionid PASTE_SESSIONID_HERE

  Mode B (Interactive password login — only works after clearing any browser checkpoint):
         npm run ig:login -- YOUR_BURNER_USERNAME
"""

import argparse
import base64
import pathlib
import subprocess
import sys
import urllib.parse

import requests

BROWSER_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)


def upsert_env_var(env_path: pathlib.Path, key: str, val: str) -> None:
    lines = env_path.read_text("utf-8").splitlines() if env_path.exists() else []
    updated = False
    out = []
    for line in lines:
        if line.strip().startswith(f"{key}="):
            out.append(f"{key}={val}")
            updated = True
        else:
            out.append(line)
    if not updated:
        out.append(f"{key}={val}")
    env_path.write_text("\n".join(out) + "\n", "utf-8")


def verify_cookie_session(cookie_dict: dict, fallback_username: str) -> str | None:
    """Verify session cookies against Instagram's web API (avoids retired /graphql/query hashes)."""
    sess = requests.Session()
    for k, v in cookie_dict.items():
        if v:
            sess.cookies.set(k, v, domain=".instagram.com", path="/")

    headers = {
        "User-Agent": BROWSER_UA,
        "X-IG-App-ID": "936619743392459",
        "X-ASBD-ID": "129477",
        "X-Requested-With": "XMLHttpRequest",
        "X-CSRFToken": cookie_dict.get("csrftoken", ""),
        "Accept": "*/*",
        "Referer": "https://www.instagram.com/",
    }

    # Check 1: Authenticated edit-profile / current_user endpoint
    try:
        r = sess.get("https://www.instagram.com/api/v1/accounts/edit/web_form_data/", headers=headers, timeout=12, allow_redirects=False)
        if r.status_code == 200 and "application/json" in r.headers.get("content-type", ""):
            form_data = (r.json() or {}).get("form_data") or {}
            if form_data.get("username"):
                return form_data["username"]
    except Exception:
        pass

    # Check 2: Authenticated web_profile_info lookup on the target username
    try:
        r2 = sess.get(
            f"https://www.instagram.com/api/v1/users/web_profile_info/?username={fallback_username}",
            headers=headers,
            timeout=12,
            allow_redirects=False,
        )
        if r2.status_code == 200 and "application/json" in r2.headers.get("content-type", ""):
            user = ((r2.json() or {}).get("data") or {}).get("user") or {}
            if user.get("username"):
                return fallback_username
    except Exception:
        pass

    return None


def main() -> int:
    parser = argparse.ArgumentParser(description="Save an Instaloader burner session locally + export GitHub Secret")
    parser.add_argument("username", help="Burner Instagram username (without @)")
    parser.add_argument(
        "--sessionid",
        type=str,
        default="",
        help="Browser `sessionid` cookie from https://www.instagram.com (bypasses password login checkpoint)",
    )
    args = parser.parse_args()

    username = args.username.strip().lstrip("@")
    root = pathlib.Path(__file__).resolve().parents[2]
    session_file = root / f".ig-session-{username}"

    import instaloader

    L = instaloader.Instaloader(quiet=True)

    if args.sessionid.strip():
        raw_sid = args.sessionid.strip().strip('"').strip("'")
        unquoted_sid = urllib.parse.unquote(raw_sid)
        encoded_sid = urllib.parse.quote(unquoted_sid, safe="")
        ds_user_id = unquoted_sid.split(":", 1)[0] if ":" in unquoted_sid and unquoted_sid.split(":", 1)[0].isdigit() else ""

        # Seed fresh csrftoken / mid / ig_did cookies from instagram.com
        seed = requests.Session()
        seed.get("https://www.instagram.com/", headers={"User-Agent": BROWSER_UA}, timeout=12)
        base_cookies = seed.cookies.get_dict()
        csrf = base_cookies.get("csrftoken") or "missing"

        verified_user = None
        winning_cookies = None

        for candidate_sid in [encoded_sid, unquoted_sid]:
            cookie_dict = {
                **base_cookies,
                "csrftoken": csrf,
                "sessionid": candidate_sid,
                "ds_user_id": ds_user_id,
                "ig_pr": "1",
                "ig_vw": "1920",
            }
            verified_user = verify_cookie_session(cookie_dict, username)
            if verified_user:
                winning_cookies = cookie_dict
                break

        if not winning_cookies:
            # Also try Instaloader's own load_session +iphone info check as final fallback
            cookie_dict = {
                **base_cookies,
                "csrftoken": csrf,
                "sessionid": encoded_sid,
                "ds_user_id": ds_user_id,
            }
            L.load_session(username, cookie_dict)
            if ds_user_id:
                try:
                    info = L.context.get_iphone_json(path=f"api/v1/users/{ds_user_id}/info/", params={})
                    if (info.get("user") or {}).get("username"):
                        verified_user = info["user"]["username"]
                        winning_cookies = cookie_dict
                except Exception:
                    pass

        if not winning_cookies or not verified_user:
            print("❌ That `sessionid` cookie was rejected or expired. Make sure you are logged in on instagram.com and copied the full `sessionid` value.")
            return 1

        username = verified_user
        session_file = root / f".ig-session-{username}"
        # Store unquoted sessionid in pickle so Instaloader's mobile `Bearer IGT:2:` token works cleanly
        winning_cookies["sessionid"] = unquoted_sid
        L.load_session(username, winning_cookies)
        L.save_session_to_file(filename=str(session_file))
        print(f"✅ Verified browser session for @{username} (ds_user_id={ds_user_id or 'ok'})!")
    else:
        L_interactive = instaloader.Instaloader(quiet=False)
        print(f"Logging in as @{username} (session will be saved to {session_file.name}, which is gitignored)...")
        L_interactive.interactive_login(username)
        L_interactive.save_session_to_file(filename=str(session_file))

    b64 = base64.b64encode(session_file.read_bytes()).decode("ascii")

    for env_path in (root / ".env", root / "collector" / ".env"):
        upsert_env_var(env_path, "IG_SCRAPER_SESSION_USER", username)
        upsert_env_var(env_path, "IG_SCRAPER_SESSION_FILE", str(session_file))

    copied = False
    try:
        subprocess.run(["pbcopy"], input=b64.encode("utf-8"), check=True)
        copied = True
    except Exception:
        pass

    print("\n✅ Saved authenticated Instagram scraper session locally in .env & collector/.env!")
    print("\n── For GitHub Actions (every 2 hours) ──")
    print(f"1. Add GitHub Secret IG_SCRAPER_SESSION_USER = {username}")
    if copied:
        print("2. Add GitHub Secret IG_SCRAPER_SESSION_B64  = (already copied to your clipboard! Cmd+V to paste)")
    else:
        print(f"2. Add GitHub Secret IG_SCRAPER_SESSION_B64  = {b64}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
