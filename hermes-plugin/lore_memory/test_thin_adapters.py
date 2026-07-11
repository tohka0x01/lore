import sys
import types
import unittest
import json
import os
import tempfile
from pathlib import Path


agent_module = types.ModuleType("agent")
memory_provider_module = types.ModuleType("agent.memory_provider")


class MemoryProvider:
    pass


memory_provider_module.MemoryProvider = MemoryProvider
agent_module.memory_provider = memory_provider_module
sys.modules.setdefault("agent", agent_module)
sys.modules.setdefault("agent.memory_provider", memory_provider_module)

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from lore_memory import LoreMemoryProvider
from lore_memory.client import LoreClient
from lore_memory.formatters import format_boot_view


RECALL_GET_NODE_DESCRIPTION = "Open a memory node. REQUIRED when opening a URI from a <recall>: copy the exact session_id and query_id from that <recall> tag."
RECALL_SESSION_ID_DESCRIPTION = "REQUIRED when the URI came from <recall>: copy the exact session_id from that <recall> tag."
RECALL_QUERY_ID_DESCRIPTION = "REQUIRED when the URI came from <recall>: copy the exact query_id from that <recall> tag."


class LoreClientThinAdapterTests(unittest.TestCase):
    def test_reads_shared_lore_config_when_constructor_and_env_omit_values(self):
        old_home = os.environ.get("HOME")
        old_base_url = os.environ.get("LORE_BASE_URL")
        old_lore_token = os.environ.get("LORE_API_TOKEN")
        old_api_token = os.environ.get("API_TOKEN")
        with tempfile.TemporaryDirectory() as home:
            os.environ["HOME"] = home
            os.environ.pop("LORE_BASE_URL", None)
            os.environ.pop("LORE_API_TOKEN", None)
            os.environ.pop("API_TOKEN", None)
            config_dir = Path(home) / ".lore"
            config_dir.mkdir()
            (config_dir / "config.json").write_text(json.dumps({
                "base_url": "http://shared-lore:18901/",
                "api_token": "shared-token",
            }), encoding="utf-8")

            client = LoreClient()

            self.assertEqual(client.base_url, "http://shared-lore:18901")
            self.assertEqual(client.api_token, "shared-token")

        if old_home is None:
            os.environ.pop("HOME", None)
        else:
            os.environ["HOME"] = old_home
        if old_base_url is None:
            os.environ.pop("LORE_BASE_URL", None)
        else:
            os.environ["LORE_BASE_URL"] = old_base_url
        if old_lore_token is None:
            os.environ.pop("LORE_API_TOKEN", None)
        else:
            os.environ["LORE_API_TOKEN"] = old_lore_token
        if old_api_token is None:
            os.environ.pop("API_TOKEN", None)
        else:
            os.environ["API_TOKEN"] = old_api_token

    def test_constructor_values_override_shared_lore_config(self):
        old_home = os.environ.get("HOME")
        with tempfile.TemporaryDirectory() as home:
            os.environ["HOME"] = home
            config_dir = Path(home) / ".lore"
            config_dir.mkdir()
            (config_dir / "config.json").write_text(json.dumps({
                "base_url": "http://shared-lore:18901",
                "api_token": "shared-token",
            }), encoding="utf-8")

            client = LoreClient(base_url="http://constructor-lore:18901", api_token="constructor-token")

            self.assertEqual(client.base_url, "http://constructor-lore:18901")
            self.assertEqual(client.api_token, "constructor-token")

        if old_home is None:
            os.environ.pop("HOME", None)
        else:
            os.environ["HOME"] = old_home

    def test_shared_lore_config_overrides_legacy_environment(self):
        old_home = os.environ.get("HOME")
        old_base_url = os.environ.get("LORE_BASE_URL")
        old_lore_token = os.environ.get("LORE_API_TOKEN")
        with tempfile.TemporaryDirectory() as home:
            os.environ["HOME"] = home
            os.environ["LORE_BASE_URL"] = "http://env-lore:18901"
            os.environ["LORE_API_TOKEN"] = "env-token"
            config_dir = Path(home) / ".lore"
            config_dir.mkdir()
            (config_dir / "config.json").write_text(json.dumps({
                "base_url": "http://shared-lore:18901",
                "api_token": "shared-token",
            }), encoding="utf-8")

            client = LoreClient()

            self.assertEqual(client.base_url, "http://shared-lore:18901")
            self.assertEqual(client.api_token, "shared-token")

        if old_home is None:
            os.environ.pop("HOME", None)
        else:
            os.environ["HOME"] = old_home
        if old_base_url is None:
            os.environ.pop("LORE_BASE_URL", None)
        else:
            os.environ["LORE_BASE_URL"] = old_base_url
        if old_lore_token is None:
            os.environ.pop("LORE_API_TOKEN", None)
        else:
            os.environ["LORE_API_TOKEN"] = old_lore_token

    def test_create_node_sends_glossary_in_node_request(self):
        client = LoreClient(base_url="http://example.com")
        requests = []
        client._request = lambda *args, **kwargs: {
            "success": True,
            "operation": "create",
            "uri": "core://agent/profile",
            "path": "agent/profile",
            "node_uuid": "uuid-create",
        } if not requests.append((args, kwargs)) else {}

        result = client.create_node(
            domain="core",
            parent_path="agent",
            title="profile",
            content="hello",
            priority=2,
            glossary=["memory"],
        )

        self.assertEqual(result["node_uuid"], "uuid-create")
        self.assertEqual(len(requests), 1)
        self.assertEqual(requests[0][1]["data"]["glossary"], ["memory"])

    def test_update_node_sends_glossary_mutations_in_node_request(self):
        client = LoreClient(base_url="http://example.com")
        requests = []
        client._request = lambda *args, **kwargs: {
            "success": True,
            "operation": "update",
            "uri": "core://agent/profile-renamed",
            "path": "agent/profile-renamed",
            "node_uuid": "uuid-update",
        } if not requests.append((args, kwargs)) else {}
        client.get_node = lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("get_node should not be called"))

        result = client.update_node(
            domain="core",
            path="agent/profile",
            content="updated",
            glossary=["fresh"],
            glossary_add=["memory"],
            glossary_remove=["archive"],
        )

        self.assertEqual(result["uri"], "core://agent/profile-renamed")
        self.assertEqual(len(requests), 1)
        self.assertNotIn("glossary", requests[0][1]["data"])
        self.assertEqual(requests[0][1]["data"]["glossary_add"], ["memory"])
        self.assertEqual(requests[0][1]["data"]["glossary_remove"], ["archive"])

    def test_lifecycle_event_calls_lifecycle_route(self):
        client = LoreClient(base_url="http://example.com")
        requests = []
        client._request = lambda *args, **kwargs: {"ok": True} if not requests.append((args, kwargs)) else {}

        client.lifecycle_event(
            "session.start",
            session_id="sess-1",
            project={"dir_name": "lore", "repo_name": "lore"},
        )
        client.lifecycle_event("prompt.submit", session_id="sess-1", prompt="hello")

        self.assertEqual(requests[0][0], ("POST", "/lifecycle/event"))
        self.assertEqual(requests[0][1]["data"]["protocol_version"], "lore.lifecycle.v1")
        self.assertEqual(requests[0][1]["data"]["runtime"], {"runtime_id": "hermes", "runtime_family": "hermes"})
        self.assertEqual(requests[0][1]["data"]["event"]["name"], "session.start")
        self.assertEqual(requests[0][1]["data"]["normalized"]["session_id"], "sess-1")
        self.assertEqual(requests[0][1]["data"]["project"], {"dir_name": "lore", "repo_name": "lore"})
        self.assertEqual(requests[1][0], ("POST", "/lifecycle/event"))
        self.assertEqual(requests[1][1]["data"]["event"]["name"], "prompt.submit")
        self.assertEqual(requests[1][1]["data"]["normalized"], {"session_id": "sess-1", "prompt": "hello"})
        self.assertEqual(len(requests), 2)


class FakeClient:
    def __init__(self):
        self.last_update_kwargs = None
        self.ended_session_id = None
        self.lifecycle_calls = []
        self.prompt_submit_gate = None
        self.prompt_submit_delay = 0.0
        self.prompt_submit_entered = None
        self._prompt_submit_enter_count = 0

    def parse_uri(self, uri):
        return uri.split("://", 1)[0], uri.split("://", 1)[1]

    def build_uri(self, domain, path):
        return f"{domain}://{path}"

    def create_node(self, **kwargs):
        return {"uri": "core://agent/profile", "node_uuid": "uuid-create"}

    def update_node(self, **kwargs):
        self.last_update_kwargs = kwargs
        return {"uri": "core://agent/profile-renamed", "node_uuid": "uuid-update"}

    def delete_node(self, *args, **kwargs):
        return {"deleted_uri": "core://legacy/profile", "uri": "core://canonical/profile"}

    def move_node(self, *args, **kwargs):
        return {"old_uri": "core://old/path", "new_uri": "core://new/path", "uri": "core://new/path"}

    def lifecycle_event(self, event_name, **kwargs):
        self.lifecycle_calls.append((event_name, dict(kwargs)))
        if event_name == "session.start":
            return {
                "host_output": {
                    "mode": "return_value",
                    "value": {"system_context": "LIFECYCLE SYSTEM"},
                },
            }
        if event_name == "prompt.submit":
            self._prompt_submit_enter_count += 1
            if self.prompt_submit_entered is not None:
                self.prompt_submit_entered.set()
            if self.prompt_submit_gate is not None:
                self.prompt_submit_gate.wait()
            if self.prompt_submit_delay:
                import time
                time.sleep(self.prompt_submit_delay)
            session_id = kwargs.get("session_id") or "sess-1"
            return {
                "host_output": {
                    "mode": "return_value",
                    "value": {
                        "context": (
                            f"<recall session_id=\"{session_id}\" query_id=\"q1\">\n"
                            "0.70 | core://project\n"
                            "</recall>"
                        )
                    },
                },
            }
        return {"host_output": {"mode": "none", "value": None}}


class LoreProviderThinAdapterTests(unittest.TestCase):
    def setUp(self):
        self.provider = LoreMemoryProvider()
        self.provider._client = FakeClient()
        self.provider._session_id = "sess-1"

    def test_format_boot_view_warns_recent_memories_not_uri_examples(self):
        text = format_boot_view({"recent_memories": [{"uri": "core://foo_2026_06_24", "priority": 2}]})
        self.assertIn("context hints", text)
        self.assertIn("event time", text)

    def test_create_tool_formats_top_level_uri(self):
        result = self.provider._tool_lore_create_node({
            "domain": "core",
            "parent_path": "agent",
            "title": "profile",
            "content": "hello",
            "priority": 2,
            "glossary": [],
        })

        self.assertEqual(result, "Created: core://agent/profile\n\nhello")

    def test_update_tool_formats_top_level_uri(self):
        result = self.provider._tool_lore_update_node({
            "uri": "core://agent/profile",
            "content": "updated",
        })

        self.assertEqual(result, "Updated: core://agent/profile-renamed")

    def test_create_schema_explains_semantic_tree_identity_and_date_meaning(self):
        schemas = {tool["name"]: tool for tool in self.provider.get_tool_schemas()}
        create = schemas["lore_create_node"]
        self.assertIn("living semantic tree", create["description"])
        self.assertIn("concept identity", create["description"])
        self.assertIn("event time", create["description"])
        self.assertIn("parent abstraction", create["description"])
        self.assertIn("concept identity", create["parameters"]["properties"]["uri"]["description"])
        self.assertIn("event time", create["parameters"]["properties"]["uri"]["description"])
        self.assertNotIn("Do not append dates", create["description"])

    def test_move_schema_requires_real_parent_nodes(self):
        schemas = {tool["name"]: tool for tool in self.provider.get_tool_schemas()}
        move = schemas["lore_move_node"]
        self.assertIn("semantic memory tree", move["description"])
        self.assertIn("parent abstraction", move["description"])
        self.assertIn("conceptual home", move["description"])
        self.assertIn("parent abstraction", move["parameters"]["properties"]["new_uri"]["description"])

    def test_update_tool_does_not_expose_glossary_replacement(self):
        schemas = {tool["name"]: tool for tool in self.provider.get_tool_schemas()}
        props = schemas["lore_update_node"]["parameters"]["properties"]

        self.assertNotIn("glossary", props)
        self.assertIn("glossary_add", props)
        self.assertIn("glossary_remove", props)
        self.assertNotIn("glossary fields", schemas["lore_update_node"]["description"])

    def test_initialize_uses_lifecycle_startup_context(self):
        import lore_memory as provider_module
        original_client = provider_module.LoreClient
        fake = FakeClient()
        provider_module.LoreClient = lambda *args, **kwargs: fake
        try:
            provider = LoreMemoryProvider()
            provider.initialize("sess-1")
        finally:
            provider_module.LoreClient = original_client

        self.assertEqual(provider.system_prompt_block(), "LIFECYCLE SYSTEM")

    def test_prefetch_uses_lifecycle_recall_context(self):
        result = self.provider.prefetch("hello", session_id="sess-1")
        self.assertIn("core://project", result)

    def test_slow_queued_prefetch_and_foreground_timeout_share_one_lifecycle_call(self):
        import threading
        import time

        gate = threading.Event()
        entered = threading.Event()
        self.provider._client.prompt_submit_gate = gate
        self.provider._client.prompt_submit_entered = entered
        original_timeout = getattr(self.provider, "_PREFETCH_WAIT_SECONDS", 5.0)
        self.provider._PREFETCH_WAIT_SECONDS = 0.05
        try:
            self.provider.queue_prefetch("slow query", session_id="sess-1")
            self.assertTrue(entered.wait(timeout=1.0))
            result = self.provider.prefetch("slow query", session_id="sess-1")
            self.assertEqual(result, "")
            prompt_calls = [
                call for call in self.provider._client.lifecycle_calls
                if call[0] == "prompt.submit"
            ]
            self.assertEqual(len(prompt_calls), 1)
            gate.set()
            deadline = time.time() + 1.0
            while time.time() < deadline and self.provider._prefetch_thread and self.provider._prefetch_thread.is_alive():
                time.sleep(0.01)
            self.assertFalse(
                self.provider._prefetch_thread and self.provider._prefetch_thread.is_alive(),
                "queued flight did not finish after gate release",
            )
            self.assertEqual(
                len([call for call in self.provider._client.lifecycle_calls if call[0] == "prompt.submit"]),
                1,
            )
        finally:
            gate.set()
            self.provider._PREFETCH_WAIT_SECONDS = original_timeout

    def test_on_session_switch_uses_new_session_and_discards_old_cache(self):
        import threading
        import time

        gate = threading.Event()
        entered = threading.Event()
        self.provider._client.prompt_submit_gate = gate
        self.provider._client.prompt_submit_entered = entered
        self.provider.queue_prefetch("hello", session_id="sess-1")
        self.assertTrue(entered.wait(timeout=1.0))
        self.provider.on_session_switch("sess-2", parent_session_id="sess-1", reset=True)
        gate.set()
        deadline = time.time() + 1.0
        while time.time() < deadline and self.provider._prefetch_thread and self.provider._prefetch_thread.is_alive():
            time.sleep(0.01)
        self.assertFalse(
            self.provider._prefetch_thread and self.provider._prefetch_thread.is_alive(),
            "stale flight did not finish after gate release",
        )

        self.provider._client.lifecycle_calls.clear()
        self.provider._client.prompt_submit_gate = None
        self.provider._client.prompt_submit_entered = None
        result = self.provider.prefetch("hello", session_id="sess-2")
        self.assertIn('session_id="sess-2"', result)
        prompt_calls = [
            call for call in self.provider._client.lifecycle_calls
            if call[0] == "prompt.submit"
        ]
        self.assertEqual(len(prompt_calls), 1)
        self.assertEqual(prompt_calls[0][1]["session_id"], "sess-2")

    def test_same_session_rewind_detaches_stale_flight_and_starts_current_generation(self):
        import threading
        import time

        gate = threading.Event()
        entered = threading.Event()
        self.provider._client.prompt_submit_gate = gate
        self.provider._client.prompt_submit_entered = entered
        self.provider.queue_prefetch("same query", session_id="sess-1")
        self.assertTrue(entered.wait(timeout=1.0))
        first_calls = [
            call for call in self.provider._client.lifecycle_calls
            if call[0] == "prompt.submit"
        ]
        self.assertEqual(len(first_calls), 1)

        # Same session identity with rewound=True must invalidate the joinable map.
        self.provider.on_session_switch("sess-1", rewound=True)

        # Current-generation request must not join the gated pre-switch flight.
        second_entered = threading.Event()
        self.provider._client.prompt_submit_entered = second_entered
        result_holder = {}

        def run_prefetch():
            result_holder["result"] = self.provider.prefetch("same query", session_id="sess-1")

        worker = threading.Thread(target=run_prefetch, daemon=True)
        worker.start()
        self.assertTrue(second_entered.wait(timeout=1.0))
        second_calls = [
            call for call in self.provider._client.lifecycle_calls
            if call[0] == "prompt.submit"
        ]
        self.assertEqual(len(second_calls), 2)

        gate.set()
        worker.join(timeout=1.0)
        self.assertFalse(worker.is_alive())
        self.assertIn('session_id="sess-1"', result_holder.get("result", ""))
        self.assertIn("core://project", result_holder.get("result", ""))

    def test_shutdown_waits_for_all_active_flights_not_only_latest_thread(self):
        import threading
        import time

        gate = threading.Event()
        entered_alpha = threading.Event()
        self.provider._client.prompt_submit_gate = gate
        self.provider._client.prompt_submit_entered = entered_alpha
        original_shutdown = getattr(self.provider, "_SHUTDOWN_WAIT_SECONDS", 5.0)
        self.provider._SHUTDOWN_WAIT_SECONDS = 1.0
        try:
            self.provider.queue_prefetch("query-alpha", session_id="sess-1")
            self.assertTrue(entered_alpha.wait(timeout=1.0))

            entered_beta = threading.Event()
            self.provider._client.prompt_submit_entered = entered_beta
            self.provider.queue_prefetch("query-beta", session_id="sess-1")
            self.assertTrue(entered_beta.wait(timeout=1.0))

            prompt_calls = [
                call for call in self.provider._client.lifecycle_calls
                if call[0] == "prompt.submit"
            ]
            self.assertEqual(len(prompt_calls), 2)

            with self.provider._prefetch_lock:
                active_before = {
                    thread for thread in self.provider._prefetch_threads if thread.is_alive()
                }
            self.assertGreaterEqual(len(active_before), 2)

            # Release both flights after shutdown has begun observing them.
            def release_soon():
                time.sleep(0.05)
                gate.set()

            releaser = threading.Thread(target=release_soon, daemon=True)
            releaser.start()
            started = time.time()
            self.provider.shutdown()
            elapsed = time.time() - started

            with self.provider._prefetch_lock:
                still_alive = {
                    thread for thread in self.provider._prefetch_threads if thread.is_alive()
                }
            self.assertEqual(still_alive, set())
            self.assertLess(elapsed, 0.9)
            self.assertEqual(
                len([call for call in self.provider._client.lifecycle_calls if call[0] == "prompt.submit"]),
                2,
            )
        finally:
            gate.set()
            self.provider._SHUTDOWN_WAIT_SECONDS = original_shutdown

    def test_ready_cache_consume_and_flight_create_are_atomic_under_contention(self):
        """Ready consume-once and same-key join/create are decided under one lock.

        Part A: concurrent prefetch against a planted ready entry consumes it once.
        Part B: gated queue+foreground waiters share exactly one prompt.submit so
        completion cannot open a second flight for the same key while waiters claim.
        The network gate is released only after every participant has claimed/joined.
        Coordination is implemented with a test-only wrapper around `_claim_or_join`;
        no production claim counters or events are used.
        """
        import threading

        # Part A — ready consume-once under concurrent claim.
        key = self.provider._identity_key("sess-1", "cached-query")
        with self.provider._prefetch_lock:
            self.provider._ready_key = key
            self.provider._ready_result = "READY-BLOCK"

        ready_results = []
        errors = []

        def claim_cached():
            try:
                ready_results.append(
                    self.provider.prefetch("cached-query", session_id="sess-1")
                )
            except Exception as exc:  # pragma: no cover
                errors.append(exc)

        claimers = [threading.Thread(target=claim_cached, daemon=True) for _ in range(8)]
        for worker in claimers:
            worker.start()
        for worker in claimers:
            worker.join(timeout=2.0)
            self.assertFalse(worker.is_alive())

        self.assertEqual(errors, [])
        self.assertEqual(ready_results.count("READY-BLOCK"), 1)
        with self.provider._prefetch_lock:
            self.assertNotEqual(self.provider._ready_key, key)
        for item in ready_results:
            self.assertTrue(item == "READY-BLOCK" or "core://project" in item)

        # Part B — stress gated same-key queue+foreground single-flight.
        for i in range(40):
            provider = LoreMemoryProvider()
            client = FakeClient()
            provider._client = client
            provider._session_id = "sess-1"
            query = f"atomic-boundary-{i}"

            gate = threading.Event()
            entered = threading.Event()
            claims_ready = threading.Event()
            claim_lock = threading.Lock()
            claim_count = {"n": 0}
            client.prompt_submit_gate = gate
            client.prompt_submit_entered = entered

            original_claim = provider._claim_or_join

            # Count non-None claim outcomes only (start/join/ready).
            # Queue + 3 foreground claims = 4 outcomes before gate release.
            def wrapped_claim(session_id, query, *, for_queue=False):
                outcome = original_claim(session_id, query, for_queue=for_queue)
                if outcome is not None:
                    with claim_lock:
                        claim_count["n"] += 1
                        if claim_count["n"] >= 4:
                            claims_ready.set()
                return outcome

            provider._claim_or_join = wrapped_claim  # type: ignore[method-assign]

            results = []
            loop_errors = []

            def queue_then_prefetch():
                try:
                    provider.queue_prefetch(query, session_id="sess-1")
                    results.append(provider.prefetch(query, session_id="sess-1"))
                except Exception as exc:  # pragma: no cover
                    loop_errors.append(exc)

            def prefetch_only():
                try:
                    results.append(provider.prefetch(query, session_id="sess-1"))
                except Exception as exc:  # pragma: no cover
                    loop_errors.append(exc)

            workers = [
                threading.Thread(target=queue_then_prefetch, daemon=True),
                threading.Thread(target=prefetch_only, daemon=True),
                threading.Thread(target=prefetch_only, daemon=True),
            ]
            for worker in workers:
                worker.start()

            self.assertTrue(
                claims_ready.wait(timeout=1.0),
                f"participants never all claimed on iteration {i}",
            )
            self.assertTrue(
                entered.wait(timeout=1.0),
                f"prompt.submit never entered on iteration {i}",
            )
            gated_calls = [
                call for call in client.lifecycle_calls if call[0] == "prompt.submit"
            ]
            self.assertEqual(
                len(gated_calls),
                1,
                f"expected single-flight while gated on iteration {i}, got {len(gated_calls)}",
            )

            gate.set()
            for worker in workers:
                worker.join(timeout=2.0)
                self.assertFalse(worker.is_alive(), f"worker hung on iteration {i}")

            self.assertEqual(loop_errors, [])
            final_calls = [
                call for call in client.lifecycle_calls if call[0] == "prompt.submit"
            ]
            self.assertEqual(
                len(final_calls),
                1,
                f"expected single-flight after release on iteration {i}, got {len(final_calls)}",
            )
            self.assertEqual(len(results), 3)
            for item in results:
                self.assertIn("core://project", item)

    def test_queue_completion_ready_consume_then_fresh_second_foreground(self):
        """Completed queue_prefetch is consumed once; next identical foreground is fresh."""
        import threading
        import time

        entered = threading.Event()
        self.provider._client.prompt_submit_entered = entered
        self.provider.queue_prefetch("queued-then-repeat", session_id="sess-1")
        self.assertTrue(entered.wait(timeout=1.0))

        deadline = time.time() + 1.0
        while time.time() < deadline and self.provider._prefetch_thread and self.provider._prefetch_thread.is_alive():
            time.sleep(0.01)
        self.assertFalse(
            self.provider._prefetch_thread and self.provider._prefetch_thread.is_alive(),
            "queued flight did not finish",
        )

        first = self.provider.prefetch("queued-then-repeat", session_id="sess-1")
        second = self.provider.prefetch("queued-then-repeat", session_id="sess-1")
        self.assertIn("core://project", first)
        self.assertIn("core://project", second)
        prompt_calls = [
            call for call in self.provider._client.lifecycle_calls
            if call[0] == "prompt.submit"
        ]
        # First lifecycle from queue_prefetch; second only after ready was consumed.
        self.assertEqual(len(prompt_calls), 2)

    def test_sequential_identical_prefetch_issues_fresh_lifecycle_call(self):
        first = self.provider.prefetch("repeat", session_id="sess-1")
        second = self.provider.prefetch("repeat", session_id="sess-1")
        self.assertIn("core://project", first)
        self.assertIn("core://project", second)
        prompt_calls = [
            call for call in self.provider._client.lifecycle_calls
            if call[0] == "prompt.submit"
        ]
        self.assertEqual(len(prompt_calls), 2)
        self.assertEqual(prompt_calls[0][1]["prompt"], "repeat")
        self.assertEqual(prompt_calls[1][1]["prompt"], "repeat")

    def test_prefetch_all_honors_explicit_session_id(self):
        self.provider._session_id = "sess-default"
        result = self.provider.prefetch_all("hello", session_id="sess-explicit")
        self.assertIn('session_id="sess-explicit"', result)
        prompt_calls = [
            call for call in self.provider._client.lifecycle_calls
            if call[0] == "prompt.submit"
        ]
        self.assertEqual(prompt_calls[0][1]["session_id"], "sess-explicit")

    def test_queue_prefetch_all_honors_explicit_session_id(self):
        import threading

        entered = threading.Event()
        self.provider._session_id = "sess-default"
        self.provider._client.prompt_submit_entered = entered
        self.provider.queue_prefetch_all("hello", session_id="sess-explicit")
        self.assertTrue(entered.wait(timeout=1.0))
        if self.provider._prefetch_thread is not None:
            self.provider._prefetch_thread.join(timeout=1.0)
            self.assertFalse(self.provider._prefetch_thread.is_alive())
        prompt_calls = [
            call for call in self.provider._client.lifecycle_calls
            if call[0] == "prompt.submit"
        ]
        self.assertEqual(len(prompt_calls), 1)
        self.assertEqual(prompt_calls[0][1]["session_id"], "sess-explicit")

    def test_prompts_sharing_500_char_prefix_do_not_collide(self):
        prefix = "x" * 500
        first = self.provider.prefetch(prefix + "-one", session_id="sess-1")
        second = self.provider.prefetch(prefix + "-two", session_id="sess-1")
        self.assertIn("core://project", first)
        self.assertIn("core://project", second)
        prompt_calls = [
            call for call in self.provider._client.lifecycle_calls
            if call[0] == "prompt.submit"
        ]
        self.assertEqual(len(prompt_calls), 2)

    def test_session_end_is_noop(self):
        self.provider.on_session_end([])
        self.assertIsNone(self.provider._client.ended_session_id)


    def test_session_read_tools_are_not_exposed(self):
        schemas = {tool["name"]: tool for tool in self.provider.get_tool_schemas()}
        self.assertNotIn("lore_list_session_reads", schemas)
        self.assertNotIn("lore_clear_session_reads", schemas)

    def test_get_node_tool_uses_unified_recall_identifier_descriptions(self):
        schemas = {tool["name"]: tool for tool in self.provider.get_tool_schemas()}
        tool = schemas["lore_get_node"]
        props = tool["parameters"]["properties"]

        self.assertEqual(tool["description"], RECALL_GET_NODE_DESCRIPTION)
        self.assertEqual(props["session_id"]["description"], RECALL_SESSION_ID_DESCRIPTION)
        self.assertEqual(props["query_id"]["description"], RECALL_QUERY_ID_DESCRIPTION)

    def test_update_tool_ignores_glossary_replacement_argument(self):
        result = self.provider._tool_lore_update_node({
            "uri": "core://agent/profile",
            "glossary": ["fresh"],
            "glossary_add": ["memory"],
        })

        self.assertEqual(result, "Updated: core://agent/profile-renamed")
        self.assertNotIn("glossary", self.provider._client.last_update_kwargs)
        self.assertEqual(self.provider._client.last_update_kwargs["glossary_add"], ["memory"])

    def test_delete_tool_formats_canonical_delete_receipt(self):
        result = self.provider._tool_lore_delete_node({"uri": "core://legacy/profile"})
        self.assertEqual(result, "Deleted: core://legacy/profile (canonical: core://canonical/profile)")

    def test_move_tool_formats_canonical_move_receipt(self):
        result = self.provider._tool_lore_move_node({
            "old_uri": "core://old/path",
            "new_uri": "core://requested/path",
        })
        self.assertEqual(result, "Moved: core://old/path → core://new/path")


if __name__ == "__main__":
    unittest.main()
