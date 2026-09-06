# Change 29: concurrent requests

Increase concurrent provider requests from one to four. Preserve the existing
250-record limit within each request. This change concerns concurrency and does
not change the batch-size contract.
