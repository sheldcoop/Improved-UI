"""tests/test_paper_routes.py — Flask endpoint integration tests."""
from __future__ import annotations

import os
import sys
import tempfile
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


@pytest.fixture
def client(tmp_path):
    """Flask test client with an isolated temp SQLite DB."""
    import services.paper_store as ps
    ps._DB_PATH = type("P", (), {
        "__str__":     lambda self: str(tmp_path / "paper_trading.db"),
        "__truediv__": lambda self, o: self,
    })()
    ps.init_db()

    # Patch init_scheduler BEFORE importing app so it doesn't start APScheduler
    from unittest.mock import patch, MagicMock
    with patch("services.paper_scheduler.init_scheduler", MagicMock()):
        # Import (or reload) app inside the patch context so the module-level
        # _init_scheduler(app) call hits the mock, not the real scheduler.
        import importlib
        import app as app_module
        importlib.reload(app_module)
        flask_app = app_module.app
        flask_app.config["TESTING"] = True
        with flask_app.test_client() as c:
            yield c


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

def test_get_settings_returns_defaults(client):
    res = client.get("/api/v1/paper-trading/settings")
    assert res.status_code == 200
    data = res.get_json()
    assert "capitalPct" in data
    assert "virtualCapital" in data


def test_update_settings_valid(client):
    res = client.post("/api/v1/paper-trading/settings",
                      json={"capitalPct": 20.0},
                      content_type="application/json")
    assert res.status_code == 200
    assert res.get_json()["capitalPct"] == 20.0


def test_update_settings_invalid_pct(client):
    res = client.post("/api/v1/paper-trading/settings",
                      json={"capitalPct": 150},
                      content_type="application/json")
    assert res.status_code == 400


# ---------------------------------------------------------------------------
# Monitors
# ---------------------------------------------------------------------------

def _monitor_payload():
    return {
        "symbol":     "RELIANCE",
        "strategyId": "1",
        "config":     {"period": 14},
        "timeframe":  "15min",
        "slPct":      2.0,
        "tpPct":      5.0,
    }


def test_create_monitor_success(client):
    from unittest.mock import patch
    with patch("routes.paper_routes.start_monitor"):
        res = client.post("/api/v1/paper-trading/monitors",
                          json=_monitor_payload(),
                          content_type="application/json")
    assert res.status_code == 201
    data = res.get_json()
    assert data["symbol"] == "RELIANCE"
    assert "id" in data


def test_create_monitor_missing_symbol(client):
    payload = _monitor_payload()
    del payload["symbol"]
    from unittest.mock import patch
    with patch("routes.paper_routes.start_monitor"):
        res = client.post("/api/v1/paper-trading/monitors",
                          json=payload,
                          content_type="application/json")
    assert res.status_code == 400


def test_create_monitor_max_limit(client):
    """Creating more than 3 monitors should return 409."""
    from unittest.mock import patch
    with patch("routes.paper_routes.start_monitor"):
        for _ in range(3):
            client.post("/api/v1/paper-trading/monitors",
                        json=_monitor_payload(),
                        content_type="application/json")
        res = client.post("/api/v1/paper-trading/monitors",
                          json=_monitor_payload(),
                          content_type="application/json")
    assert res.status_code == 409


def test_delete_nonexistent_monitor(client):
    from unittest.mock import patch
    with patch("routes.paper_routes.stop_monitor"):
        res = client.delete("/api/v1/paper-trading/monitors/ghost_id")
    assert res.status_code == 404


# ---------------------------------------------------------------------------
# Positions
# ---------------------------------------------------------------------------

def test_get_positions_empty(client):
    res = client.get("/api/v1/paper-trading/positions")
    assert res.status_code == 200
    assert res.get_json() == []


def test_add_position_success(client):
    res = client.post("/api/v1/paper-trading/positions",
                      json={"symbol": "NIFTY 50", "side": "LONG",
                            "qty": 50, "avgPrice": 22000.0},
                      content_type="application/json")
    assert res.status_code == 201
    data = res.get_json()
    assert data["symbol"] == "NIFTY 50"


def test_add_position_invalid_side(client):
    res = client.post("/api/v1/paper-trading/positions",
                      json={"symbol": "NIFTY 50", "side": "SIDEWAYS",
                            "qty": 50, "avgPrice": 22000.0},
                      content_type="application/json")
    assert res.status_code == 400


def test_close_position_not_found(client):
    from unittest.mock import patch
    with patch("services.ltp_service.get_ltp", return_value=100.0):
        res = client.delete("/api/v1/paper-trading/positions/ghost")
    assert res.status_code == 404


# ---------------------------------------------------------------------------
# History
# ---------------------------------------------------------------------------

def test_get_history_empty(client):
    res = client.get("/api/v1/paper-trading/history")
    assert res.status_code == 200
    assert isinstance(res.get_json(), list)
