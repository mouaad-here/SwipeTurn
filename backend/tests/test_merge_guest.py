import sys
import os
import pytest
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient
from main import app
from dependencies import get_current_user

client = TestClient(app)

@pytest.fixture
def mock_user_session():
    user = {"id": "user_123", "clerk_id": "clerk_real"}
    app.dependency_overrides[get_current_user] = lambda: user
    yield user
    app.dependency_overrides.pop(get_current_user, None)

@patch("routers.users.get_supabase")
def test_signup_merge(mock_get_supabase, mock_user_session):
    mock_db = MagicMock()
    mock_get_supabase.return_value = mock_db
    
    mock_guest = {
        "id": "guest_abc", 
        "preferences": {"seniority": "intern"},
        "experience_level": "intern",
        "target_locations": ["Remote"],
        "fields": ["SWE"],
        "desired_job_type": ["Full-time"]
    }
    
    mock_db.table().select().eq().execute.return_value = MagicMock(data=[mock_guest])
    
    response = client.post("/users/merge-guest", json={"guest_id": "abc", "auth_type": "signup"})
    
    assert response.status_code == 200
    assert response.json()["merged"] is True

    # Get calls to db.table("users").update(...)
    calls = mock_db.table.mock_calls
    update_called = False
    for call in calls:
        if call[0] == "().update":
            update_payload = call[1][0]
            if "preferences" in update_payload and update_payload["preferences"] == {"seniority": "intern"}:
                update_called = True
    assert update_called, "Signup merge didn't carry over preferences"

@patch("routers.users.get_supabase")
def test_login_account_preferences_win(mock_get_supabase):
    user_with_prefs = {"id": "user_123", "clerk_id": "clerk_real", "preferences": {"seniority": "senior"}}
    app.dependency_overrides[get_current_user] = lambda: user_with_prefs
    
    mock_db = MagicMock()
    mock_get_supabase.return_value = mock_db
    
    mock_guest = {
        "id": "guest_abc", 
        "preferences": {"seniority": "intern"}, # Should NOT overwrite senior
    }
    
    mock_db.table().select().eq().execute.return_value = MagicMock(data=[mock_guest])
    
    response = client.post("/users/merge-guest", json={"guest_id": "abc", "auth_type": "login"})
    
    assert response.status_code == 200
    
    calls = mock_db.table.mock_calls
    for call in calls:
        if call[0] == "().update":
            update_payload = call[1][0]
            # Ensure "preferences" is NOT in the payload because the user already has it
            assert "preferences" not in update_payload, "Login merge illegally overwrote preferences!"
            
    app.dependency_overrides.pop(get_current_user, None)

@patch("routers.users.get_supabase")
def test_merge_idempotency(mock_get_supabase, mock_user_session):
    mock_db = MagicMock()
    mock_get_supabase.return_value = mock_db
    
    # Guest not found (already merged and deleted)
    mock_db.table().select().eq().execute.return_value = MagicMock(data=[])
    
    response = client.post("/users/merge-guest", json={"guest_id": "abc", "auth_type": "signup"})
    
    assert response.status_code == 200
    assert response.json()["merged"] is False
    assert response.json()["message"] == "No guest record found"
