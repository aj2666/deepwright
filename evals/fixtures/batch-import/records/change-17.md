# Change 17: provider import support

Decision: send at most 250 records in each provider request. The provider contract
limits a request to 250 records; our batch size follows that limit. No batch-size
performance experiment was conducted for this change.

The first implementation sends one request at a time.
