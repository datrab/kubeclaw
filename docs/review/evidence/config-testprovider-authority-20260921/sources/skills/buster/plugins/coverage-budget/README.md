# Coverage Budget Test Provider

This provider reads one or more verified LCOV artifacts from upstream test
nodes. It reports every input and calculates line coverage. A blocking node
must set `minimumLinePercent`. An advisory node can omit the minimum and report
facts only.

The provider is separate from the unit-test result. A unit test can pass while
its coverage budget fails. This preserves the meaning of both results.

The provider verifies input size and digest, rejects duplicates and malformed
LCOV, and applies fixed size and line-count limits. It combines line records by
source file and line number when `combine` is true. Set `combine` to false to
apply the minimum to the weakest input.
