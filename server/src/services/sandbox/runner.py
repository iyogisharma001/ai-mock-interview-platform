# Test harness executed inside the sandbox container. It never sees expected values:
# it reports what the candidate's function returned and the host does the comparison.
import contextlib
import copy
import importlib.util
import io
import json
import sys
import time
import traceback

SENTINEL = sys.argv[1]
REAL_STDOUT = sys.stdout


def emit(payload):
    REAL_STDOUT.write("\n" + SENTINEL + json.dumps(payload, default=list) + "\n")
    REAL_STDOUT.flush()


with open("/workspace/tests.json") as fh:
    spec = json.load(fh)

try:
    module_spec = importlib.util.spec_from_file_location("solution", "/workspace/solution.py")
    module = importlib.util.module_from_spec(module_spec)
    module_spec.loader.exec_module(module)
    fn = getattr(module, spec["functionName"], None)
    if not callable(fn):
        raise NameError('Function "%s" is not defined' % spec["functionName"])
except BaseException as exc:  # noqa: BLE001 - syntax errors, SystemExit, anything
    traceback.print_exc()
    emit({"type": "load_error", "message": "%s: %s" % (type(exc).__name__, exc)})
    sys.exit(1)

total = len(spec["tests"])
for index, args in enumerate(spec["tests"]):
    captured = io.StringIO()
    started = time.perf_counter()
    result = {"type": "test", "index": index}
    try:
        with contextlib.redirect_stdout(captured):
            actual = fn(*copy.deepcopy(args))
        json.dumps(actual, default=list)  # fail here, not in emit, if unserialisable
        result.update(ok=True, actual=actual)
    except BaseException as exc:  # noqa: BLE001
        tb = traceback.format_exc(limit=6)
        result.update(ok=False, error=tb[-1500:] if tb else str(exc))
    result["ms"] = round((time.perf_counter() - started) * 1000, 3)
    result["stdout"] = captured.getvalue()[:2000]
    print("> test %d/%d executed in %.2f ms" % (index + 1, total, result["ms"]), flush=True)
    emit(result)

emit({"type": "done"})
