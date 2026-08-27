def test_mastery_summary_empty(client, auth_headers):
    response = client.get("/api/v1/mastery/summary", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert "data" in data
    # By default, without completed crucible sessions, it returns an empty list
    assert isinstance(data["data"], list)

def test_mastery_map_not_found(client, auth_headers):
    response = client.get("/api/v1/mastery/nonexistent_topic_id", headers=auth_headers)
    assert response.status_code == 404
