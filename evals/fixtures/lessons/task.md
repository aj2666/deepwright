# Supplied task record

Project: invoice-fixture. Runtime: Node 24, package directory ./service.
Observed command from repository root: node --test; failed because service-local test data was resolved from the wrong directory.
Observed corrected command from ./service: node --test; collected and passed four tests.
Current project skill: read the package manifest and run checks from the package directory.
Counterexample: the separate ./cli package intentionally tests behavior across several current working directories; forcing all its tests into ./service would be wrong.
No other task records or usage data are available. The user authorized reflection proposals only.
