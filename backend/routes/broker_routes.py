"""Broker blueprint — Dhan credential management and connection testing.

Endpoints:
    GET  /broker/dhan/status  — Return current credentials and token age.
    POST /broker/dhan/save    — Persist new credentials to backend/.env.
    POST /broker/dhan/test    — Validate credentials against the Dhan API.
"""

import os
import logging
from typing import Optional
from datetime import datetime, timezone
from pathlib import Path

import requests
from flask import Blueprint, jsonify, request

broker_bp = Blueprint("broker", __name__)
logger = logging.getLogger(__name__)

# Path to the .env file relative to this file's parent (backend/)
_ENV_PATH = Path(__file__).parent.parent / ".env"


def _read_env() -> dict[str, str]:
    """Read the .env file and return a key→value dict.

    Returns:
        Dictionary of environment variable key-value pairs.
    """
    env: dict[str, str] = {}
    if not _ENV_PATH.exists():
        return env
    for line in _ENV_PATH.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, val = line.partition("=")
            env[key.strip()] = val.strip()
    return env


def _write_env(updates: dict[str, str]) -> None:
    """Merge *updates* into the .env file, preserving existing lines.

    Args:
        updates: Key-value pairs to write or overwrite in .env.
    """
    lines: list[str] = []
    updated_keys: set[str] = set()

    if _ENV_PATH.exists():
        for line in _ENV_PATH.read_text().splitlines():
            stripped = line.strip()
            if stripped and not stripped.startswith("#") and "=" in stripped:
                key = stripped.split("=", 1)[0].strip()
                if key in updates:
                    lines.append(f"{key}={updates[key]}")
                    updated_keys.add(key)
                    continue
            lines.append(line)

    # Append any keys not already present
    for key, val in updates.items():
        if key not in updated_keys:
            lines.append(f"{key}={val}")

    _ENV_PATH.write_text("\n".join(lines) + "\n")


def _decode_token_expiry(token: str) -> Optional[datetime]:
    """Decode the exp claim from a JWT without verifying the signature.

    Args:
        token: Raw JWT string.

    Returns:
        Expiry datetime (UTC) or None if decoding fails.
    """
    try:
        import base64, json as _json
        parts = token.split(".")
        if len(parts) < 2:
            return None
        # Add padding
        payload_b64 = parts[1] + "=" * (-len(parts[1]) % 4)
        payload = _json.loads(base64.urlsafe_b64decode(payload_b64))
        exp = payload.get("exp")
        if exp:
            return datetime.fromtimestamp(exp, tz=timezone.utc)
    except Exception:
        pass
    return None


@broker_bp.route("/dhan/status", methods=["GET"])
def dhan_status() -> tuple:
    """Return the current Dhan credentials and token health.

    Returns:
        JSON with client_id, token_preview, expiry_utc, is_expired, hours_remaining.
    """
    try:
        env = _read_env()
        client_id = env.get("DHAN_CLIENT_ID", "")
        token = env.get("DHAN_ACCESS_TOKEN", "")

        expiry_dt = _decode_token_expiry(token) if token else None
        now_utc = datetime.now(tz=timezone.utc)

        is_expired = False
        hours_remaining: Optional[float] = None
        expiry_str: Optional[str] = None

        if expiry_dt:
            delta = expiry_dt - now_utc
            hours_remaining = round(delta.total_seconds() / 3600, 1)
            is_expired = delta.total_seconds() <= 0
            expiry_str = expiry_dt.strftime("%Y-%m-%d %H:%M UTC")

        return jsonify({
            "client_id": client_id,
            "token_preview": f"{token[:20]}…" if len(token) > 20 else token,
            "token_set": bool(token),
            "expiry_utc": expiry_str,
            "is_expired": is_expired,
            "hours_remaining": hours_remaining,
        }), 200

    except Exception as exc:
        logger.error(f"dhan_status error: {exc}", exc_info=True)
        return jsonify({"status": "error", "message": "Failed to read credentials"}), 500


@broker_bp.route("/dhan/save", methods=["POST"])
def dhan_save() -> tuple:
    """Persist new Dhan credentials to backend/.env.

    Request JSON:
        client_id (str): Dhan client ID.
        access_token (str): Dhan JWT access token.

    Returns:
        JSON with status and token expiry info.
    """
    try:
        data = request.get_json(silent=True) or {}
        client_id: str = str(data.get("client_id", "")).strip()
        access_token: str = str(data.get("access_token", "")).strip()

        if not client_id:
            return jsonify({"status": "error", "message": "client_id is required"}), 400
        if not access_token:
            return jsonify({"status": "error", "message": "access_token is required"}), 400

        _write_env({
            "DHAN_CLIENT_ID": client_id,
            "DHAN_ACCESS_TOKEN": access_token,
        })

        # Also update the live process environment so the running server uses them
        os.environ["DHAN_CLIENT_ID"] = client_id
        os.environ["DHAN_ACCESS_TOKEN"] = access_token

        expiry_dt = _decode_token_expiry(access_token)
        expiry_str = expiry_dt.strftime("%Y-%m-%d %H:%M UTC") if expiry_dt else None

        logger.info(f"Dhan credentials updated for client {client_id}")
        return jsonify({
            "status": "saved",
            "expiry_utc": expiry_str,
        }), 200

    except Exception as exc:
        logger.error(f"dhan_save error: {exc}", exc_info=True)
        return jsonify({"status": "error", "message": "Failed to save credentials"}), 500


@broker_bp.route("/dhan/test", methods=["POST"])
def dhan_test() -> tuple:
    """Validate Dhan credentials by calling the Dhan API.

    Request JSON (optional — falls back to .env values):
        client_id (str): Dhan client ID.
        access_token (str): Dhan JWT access token.

    Returns:
        JSON with status 'connected' or 'error'.
    """
    try:
        # Accept both JSON and non-JSON requests (e.g. curl without Content-Type)
        data = request.get_json(silent=True) or {}
        env = _read_env()

        client_id = str(data.get("client_id") or env.get("DHAN_CLIENT_ID", "")).strip()
        access_token = str(data.get("access_token") or env.get("DHAN_ACCESS_TOKEN", "")).strip()

        if not client_id or not access_token:
            return jsonify({"status": "error", "message": "Credentials not configured"}), 400

        # Check token expiry first (fast path — no network call needed)
        expiry_dt = _decode_token_expiry(access_token)
        if expiry_dt:
            from datetime import timezone as _tz
            if expiry_dt < datetime.now(tz=_tz.utc):
                return jsonify({
                    "status": "error",
                    "message": f"Token expired at {expiry_dt.strftime('%Y-%m-%d %H:%M UTC')}. Generate a new one from the Dhan portal.",
                }), 401

        # Make a lightweight Dhan API call — per docs, /profile is a good validity test.
        # https://dhanhq.co/docs/v2/authentication/
        try:
            url = "https://api.dhan.co/v2/profile"
            headers = {
                "access-token": access_token,
                # Some endpoints require client-id; /profile in docs shows only access-token.
                "client-id": client_id,
                "Accept": "application/json",
            }
            resp = requests.get(url, headers=headers, timeout=30)

            if 200 <= resp.status_code <= 299:
                return jsonify({"status": "connected", "message": "Dhan API connected successfully"}), 200

            # Try to surface Dhan's message if present
            try:
                body = resp.json()
            except Exception:
                body = {"raw": resp.text}

            return jsonify({
                "status": "error",
                "message": body.get("errorMessage") if isinstance(body, dict) else "Dhan API returned an error",
                "details": body,
            }), 401

        except Exception as api_exc:
            logger.warning(f"Dhan API call failed: {api_exc}")
            return jsonify({"status": "error", "message": f"Dhan API error: {str(api_exc)}"}), 502

    except Exception as exc:
        logger.error(f"dhan_test error: {exc}", exc_info=True)
        return jsonify({"status": "error", "message": "Internal error during connection test"}), 500
