# Still Building

Explore features indexed launches that have a recent, operator-reviewed milestone. The token page links to the evidence. Trading activity, market capitalization, likes, and paid placement are outside the eligibility criteria.

Review the launch mint and a dated public deliverable before adding an entry. A shipped tool, published community work, or evidence of a completed event can qualify. Remove an entry if its evidence is withdrawn or found inaccurate.

Set `JEET_STILL_BUILDING_RECEIPTS` as a server environment variable containing a JSON array of entries. Each entry has:

| Key | Value |
| --- | --- |
| `network` | Exact discovery scope in the form `<validator genesis>:<launch program address>` |
| `mint` | Launch mint address from Explore |
| `title` | Reviewed milestone description, up to 160 characters |
| `date` | Date the work was delivered in `YYYY-MM-DD` UTC |
| `url` | Public HTTPS evidence link |

Restart the app after updating the configuration. Future dates are ignored and entries expire 30 days after the milestone date at midnight UTC. If a mint has multiple active entries, the latest dated entry appears. Featured launches use the same newest-launch ordering, search, and pagination as New.

An empty or missing configuration leaves the tab empty. This release uses the existing local or private-preview launch index and does not add public submission, payout, or fee logic.
