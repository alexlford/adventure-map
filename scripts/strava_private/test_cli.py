"""Synthetic command-boundary checks. No credentials, Keychain or network."""
import contextlib
import io
import unittest
from unittest.mock import MagicMock, patch

from . import cli


class CommandBoundaryTests(unittest.TestCase):
    def test_non_mac_refused_before_store_or_keychain(self):
        with patch.object(cli.sys, "platform", "linux"), \
                patch.object(cli, "PrivateStore") as local, \
                patch.object(cli, "KeychainStore") as keychain, \
                contextlib.redirect_stderr(io.StringIO()) as err:
            self.assertEqual(cli.main(["sync"]), 1)
        local.assert_not_called()
        keychain.assert_not_called()
        self.assertIn("synthetic", err.getvalue())

    def test_ai_or_ci_environment_refused_even_on_mac(self):
        for marker in ("CI", "GITHUB_ACTIONS", "CODEX_THREAD_ID", "CODEX_CI",
                       "CODEX_SANDBOX", "CODEX_MANAGED_BY_NPM", "OPENAI_API_KEY",
                       "ANTHROPIC_API_KEY", "CURSOR_AGENT", "CLAUDECODE"):
            with self.subTest(marker=marker), patch.object(cli.sys, "platform", "darwin"), \
                    patch.dict(cli.os.environ, {marker: "synthetic"}, clear=True):
                with self.assertRaises(cli.SyncError):
                    cli.require_local_mac()

    def test_redirected_output_refused(self):
        with patch.object(cli.sys, "platform", "darwin"), \
                patch.dict(cli.os.environ, {}, clear=True), \
                patch.object(cli.sys.stdin, "isatty", return_value=True), \
                patch.object(cli.sys.stdout, "isatty", return_value=False):
            with self.assertRaises(cli.SyncError):
                cli.require_local_mac()

    def test_interactive_mac_guard_can_pass_without_live_operation(self):
        with patch.object(cli.sys, "platform", "darwin"), \
                patch.dict(cli.os.environ, {}, clear=True), \
                patch.object(cli.sys.stdin, "isatty", return_value=True), \
                patch.object(cli.sys.stdout, "isatty", return_value=True):
            cli.require_local_mac()

    def test_cleanup_guard_needs_no_terminal(self):
        with patch.object(cli.sys, "platform", "darwin"), \
                patch.dict(cli.os.environ, {}, clear=True), \
                patch.object(cli.sys.stdin, "isatty", return_value=False), \
                patch.object(cli.sys.stdout, "isatty", return_value=False):
            cli.require_local_mac(interactive=False)

    def test_unexpected_errors_never_print_values_or_tracebacks(self):
        sensitive_fixture = "SYNTHETIC_PRIVATE_SENTINEL"
        with patch.object(cli, "require_local_mac"), \
                patch.object(cli, "PrivateStore", side_effect=RuntimeError(sensitive_fixture)), \
                contextlib.redirect_stderr(io.StringIO()) as err:
            self.assertEqual(cli.main(["status"]), 1)
        self.assertNotIn(sensitive_fixture, err.getvalue())
        self.assertNotIn("Traceback", err.getvalue())

    def mock_local(self):
        local = MagicMock()
        local.locked.side_effect = lambda: contextlib.nullcontext(local)
        local.load_control.return_value = {
            "schemaVersion": 1, "checkpoint": 123, "last_complete_scan": 456,
            "pending": {"synthetic": True}, "rate": {"blocked_until": 789},
        }
        return local

    def test_auth_resets_account_cursor_and_purges_before_browser(self):
        local = self.mock_local()
        def authorized(*_args, **kwargs):
            self.assertIs(kwargs["control_store"], local)
            local.clear_activity_data.assert_called_once()
            local.save_control.assert_called_with({"schemaVersion": 1, "rate": {"blocked_until": 789}})
        with patch.object(cli, "require_local_mac"), \
                patch.object(cli, "PrivateStore", return_value=local), \
                patch.object(cli, "KeychainStore"), patch.object(cli, "Transport"), \
                patch("scripts.strava_private.cleanup.install_cleanup"), \
                patch.object(cli, "authorize", side_effect=authorized), \
                contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(cli.main(["auth"]), 0)

    def test_failed_cleanup_stops_auth_before_credentials(self):
        local = self.mock_local()
        with patch.object(cli, "require_local_mac"), \
                patch.object(cli, "PrivateStore", return_value=local), \
                patch.object(cli, "KeychainStore"), patch.object(cli, "Transport"), \
                patch("scripts.strava_private.cleanup.install_cleanup", side_effect=cli.StorageError("Synthetic cleanup failure")), \
                patch.object(cli, "authorize") as auth, \
                contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(cli.main(["auth"]), 1)
        auth.assert_not_called()

    def test_disconnect_failure_still_purges_and_resets_cursor(self):
        local = self.mock_local()
        with patch.object(cli, "require_local_mac"), \
                patch.object(cli, "PrivateStore", return_value=local), \
                patch.object(cli, "KeychainStore"), patch.object(cli, "Transport"), \
                patch.object(cli, "disconnect", side_effect=cli.ApiError(code="request_failed")), \
                contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(cli.main(["disconnect"]), 1)
        local.clear_activity_data.assert_called_once()
        local.save_control.assert_called_with({"schemaVersion": 1, "rate": {"blocked_until": 789}})

    def test_failed_reauthorization_preserves_uncertainty(self):
        local = self.mock_local()
        local.load_control.return_value["authorization_uncertain"] = True
        with patch.object(cli, "require_local_mac"), \
                patch.object(cli, "PrivateStore", return_value=local), \
                patch.object(cli, "KeychainStore"), patch.object(cli, "Transport"), \
                patch("scripts.strava_private.cleanup.install_cleanup"), \
                patch.object(cli, "authorize", side_effect=cli.AuthError("access-denied", "Synthetic denial")), \
                contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(cli.main(["reauth"]), 1)
        local.save_control.assert_called_once_with({"schemaVersion": 1,
            "rate": {"blocked_until": 789}, "authorization_uncertain": True})

    def test_disconnect_local_only_does_not_claim_remote_revocation(self):
        for malformed in (False, True):
            with self.subTest(malformed=malformed):
                local = self.mock_local()
                keychain = MagicMock()
                if malformed:
                    keychain.load.side_effect = cli.AuthError("keychain-invalid", "Synthetic corrupt item")
                else:
                    keychain.load.return_value = None
                with patch.object(cli, "require_local_mac"), \
                        patch.object(cli, "PrivateStore", return_value=local), \
                        patch.object(cli, "KeychainStore", return_value=keychain), \
                        patch.object(cli, "Transport") as transport, \
                        contextlib.redirect_stdout(io.StringIO()) as out:
                    self.assertEqual(cli.main(["disconnect"]), 0)
                keychain.delete.assert_called_once()
                transport.return_value.request.assert_not_called()
                self.assertIn("Remote revocation was not verified", out.getvalue())
                self.assertNotIn("authorization revoked", out.getvalue())

    def test_token_refresh_failure_purges_cache(self):
        local = self.mock_local()
        with patch.object(cli, "require_local_mac"), \
                patch.object(cli, "PrivateStore", return_value=local), \
                patch.object(cli, "KeychainStore"), patch.object(cli, "Transport"), \
                patch.object(cli, "status", side_effect=cli.AuthError("token-refresh-failed", "Synthetic refresh failure")), \
                contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(cli.main(["status"]), 1)
        local.clear_activity_data.assert_called_once()


if __name__ == "__main__":
    unittest.main()
