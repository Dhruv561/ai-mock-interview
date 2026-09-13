from app.agents.code_analyser import analyse_code


def test_non_python_language_always_returns_empty():
    assert analyse_code("int main() { for(;;) for(;;); }", "cpp") == []
    assert analyse_code("anything at all", "JavaScript") == []
    assert analyse_code("", "") == []


def test_python_is_matched_case_insensitively():
    # a nested loop should be detected the same way regardless of how the
    # extension happens to capitalise the language string
    code = "for i in range(3):\n    for j in range(3):\n        pass\n"
    assert analyse_code(code, "Python") == analyse_code(code, "python")
    assert analyse_code(code, "PYTHON")


def test_syntax_error_returns_one_observation_and_never_raises():
    observations = analyse_code("def f(:\n    pass", "python")
    assert len(observations) == 1
    assert "syntax error" in observations[0].lower()
    assert "line" in observations[0].lower()


def test_valid_simple_function_has_no_observations():
    code = "def two_sum(nums, target):\n    return [0, 1]\n"
    assert analyse_code(code, "python") == []


def test_stub_function_is_not_flagged_for_missing_return():
    code = "def two_sum(nums, target):\n    pass\n"
    assert analyse_code(code, "python") == []


def test_nested_loop_is_detected():
    code = (
        "def brute_force(nums):\n"
        "    for i in range(len(nums)):\n"
        "        for j in range(len(nums)):\n"
        "            pass\n"
    )
    observations = analyse_code(code, "python")
    assert any("nested loop" in o.lower() for o in observations)


def test_sibling_loops_are_not_flagged_as_nested():
    code = (
        "def f(nums):\n"
        "    for i in nums:\n"
        "        pass\n"
        "    for j in nums:\n"
        "        pass\n"
    )
    observations = analyse_code(code, "python")
    assert not any("nested loop" in o.lower() for o in observations)


def test_missing_return_is_flagged_for_non_stub_function():
    code = "def f(nums):\n    total = 0\n    total += 1\n"
    observations = analyse_code(code, "python")
    assert any("no return statement" in o.lower() for o in observations)


def test_generator_function_is_not_flagged_for_missing_return():
    code = "def f(nums):\n    for n in nums:\n        yield n\n"
    observations = analyse_code(code, "python")
    assert not any("no return statement" in o.lower() for o in observations)


def test_recursion_without_base_case_is_flagged():
    code = "def f(n):\n    total = f(n - 1)\n    return total\n"
    observations = analyse_code(code, "python")
    assert any("recursively" in o.lower() for o in observations)


def test_recursion_with_conditional_is_not_flagged():
    code = "def f(n):\n    if n == 0:\n        return 0\n    return f(n - 1)\n"
    observations = analyse_code(code, "python")
    assert not any("recursively" in o.lower() for o in observations)


def test_bare_except_is_flagged():
    code = "def f():\n    try:\n        return 1\n    except:\n        return 0\n"
    observations = analyse_code(code, "python")
    assert any("bare 'except:'" in o.lower() for o in observations)


def test_broad_except_exception_is_flagged():
    code = "def f():\n    try:\n        return 1\n    except Exception:\n        return 0\n"
    observations = analyse_code(code, "python")
    assert any("except exception" in o.lower() for o in observations)


def test_specific_except_is_not_flagged():
    code = "def f():\n    try:\n        return 1\n    except ValueError:\n        return 0\n"
    observations = analyse_code(code, "python")
    assert not any("except" in o.lower() for o in observations)


def test_unused_import_is_flagged():
    code = "import os\n\ndef f():\n    return 1\n"
    observations = analyse_code(code, "python")
    assert any("'os'" in o and "unused" in o.lower() for o in observations)


def test_used_import_is_not_flagged():
    code = "import os\n\ndef f():\n    return os.getcwd()\n"
    observations = analyse_code(code, "python")
    assert not any("unused" in o.lower() for o in observations)


def test_star_import_is_not_flagged():
    code = "from os import *\n\ndef f():\n    return 1\n"
    observations = analyse_code(code, "python")
    assert not any("unused" in o.lower() for o in observations)
