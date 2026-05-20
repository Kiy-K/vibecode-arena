from arena.agent import create_session


def test_create_session_routes_context_outside_executable_backend(monkeypatch) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-test")
    monkeypatch.setenv("DEEPAGENT_SANDBOX_PROVIDER", "local")

    session = create_session("unit-context-route")
    try:
        assert type(session.backend).__name__ == "CompositeBackend"
        assert type(session.backend.default).__name__ == "LocalShellBackend"
        assert "/context/" in session.backend.routes
        assert "/skills/" in session.backend.routes
        assert session.context_root is not None
        assert session.context_root.exists()
        assert session.checkpointer is not None
    finally:
        context_root = session.context_root
        session.close()

    assert context_root is not None
    assert not context_root.exists()
