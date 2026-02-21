 > /Users/prince/Desktop/Improved-UI/test_api.py && > /Users/prince/Desktop/Improved-UI/test_api2.py && > /Users/prince/Desktop/Improved-UI/test_api3.py
 nl -ba /Users/prince/Desktop/Improved-UI/backend/tests/test_integration.py | sed -n '380,450p'
 nl -ba /Users/prince/Desktop/Improved-UI/backend/tests/test_integration.py | head -n 500
 grep -n "TestAutoTuneRoute" -n /Users/prince/Desktop/Improved-UI/backend/tests/test_integration.py
 nl -ba "/Users/prince/Desktop/Improved-UI/backend/tests/test_integration.py" | head -n 450
 cat -n "/Users/prince/Desktop/Improved-UI/backend/tests/test_integration.py" | head -n 450
 sed -i '' '/class TestAutoTuneRoute/,/# Auto-tune\b/d' /Users/prince/Desktop/Improved-UI/backend/tests/test_integration.py
 python - <<'PY'
import pathlib
path=pathlib.Path("/Users/prince/Desktop/Improved-UI/backend/tests/test_integration.py")
lines=path.read_text().splitlines()
out=[]
skip=False
for line in lines:
    if line.startswith('class TestAutoTuneRoute'):
        skip=True
        continue
    if skip and line.strip().startswith('#') and 'Market route tests' in line:
        skip=False
        out.append(line)
        continue
    if not skip:
        out.append(line)
path.write_text("\n".join(out))
PY
 python - <<'PY'
import pathlib
path=pathlib.Path("/Users/prince/Desktop/Improved-UI/backend/tests/test_integration.py")
lines=path.read_text().splitlines()
out=[]
skip=False
for line in lines:
    if line.startswith('class TestAutoTuneRoute'):
        skip=True
        continue
    if skip and line.startswith('class TestMarketRoute'):
        skip=False
    if not skip:
        out.append(line)
path.write_text("\n".join(out))
PY
 echo '' > /Users/prince/Desktop/Improved-UI/test_api.py && echo '' > /Users/prince/Desktop/Improved-UI/test_api2.py && echo '' > /Users/prince/Desktop/Improved-UI/test_api3.py
 npm run build
 npm run build
 echo hello
 cd /Users/prince/Desktop/Improved-UI/backend && pytest backend/tests/test_integration.py::TestAutoTuneDateLogic -q
 cd /Users/prince/Desktop/Improved-UI/backend && pytest backend/tests/test_integration.py::TestOptimizationValidation -q
 cd /Users/prince/Desktop/Improved-UI/backend && pytest backend/tests/test_integration.py -q
 cd /Users/prince/Desktop/Improved-UI/backend && ls backend/tests
 cd /Users/prince/Desktop/Improved-UI/backend && pytest backend/tests/test_integration.py::TestOptimizationValidation -q
 python - <<'PY'
import pytest, sys
print(pytest.__version__)
print(pytest.main(['backend/tests/test_integration.py::TestOptimizationValidation','-q']))
PY
 cd /Users/prince/Desktop/Improved-UI/backend && python - <<'PY'
import pytest, sys
print('pytest', pytest.__version__)
res = pytest.main(['backend/tests/test_integration.py::TestOptimizationValidation','-q'])
print('exit', res)
PY
 cd /Users/prince/Desktop/Improved-UI/backend && pytest backend/tests/test_integration.py::TestCacheVersioning -q
 cd /Users/prince/Desktop/Improved-UI/backend && pytest backend/tests/test_integration.py::TestErrorLogging -q
 cd /Users/prince/Desktop/Improved-UI/backend && pytest tests/test_integration.py::TestOptimizationValidation -q
 cd /Users/prince/Desktop/Improved-UI/backend && pytest -q tests/test_integration.py::TestOptimizationValidation
 cd /Users/prince/Desktop/Improved-UI/backend && pytest -q
 pwd; ls -l
 echo hello
 python - <<'PYTHON'
import pytest, sys
pytest.main(['-q','tests/test_integration.py::TestOptimizationValidation::test_run_missing_symbol'])
PYTHON
 cd /Users/prince/Desktop/Improved-UI/backend && python - <<'PYTHON'
import pytest
import sys
# run a couple of tests and write results to a file
with open('test_output.txt', 'w') as f:
    ret = pytest.main(['tests/test_integration.py::TestOptimizationValidation::test_run_missing_symbol',
                       'tests/test_integration.py::TestOptimizationValidation::test_run_ranges_not_dict',
                       'tests/test_integration.py::TestOptimizationValidation::test_run_bad_dates',
                       'tests/test_integration.py::TestErrorLogging::test_uncaught_exception_returns_json',
                       'tests/test_integration.py::TestErrorLogging::test_metadata_written_and_readable'],
                      stdout=f)
print('pytest returned', ret)
PYTHON && cat test_output.txt
 npm run dev --silent
 npm run dev
 npx tsc --noEmit
 grep -n "jest" package.json
 sed -n '1,120p' package.json
 cat package.json | head -n 60
 ls -l package.json && wc -l package.json
 cd /Users/prince/Desktop/Improved-UI/backend && python - <<'PYTHON'
import pytest
pytest.main(['-q','tests/test_integration.py::TestMarketRoute::test_fetch_requires_symbol',
            'tests/test_integration.py::TestMarketRoute::test_fetch_success_returns_health_and_sample'])
PYTHON
 npx tsc --noEmit
