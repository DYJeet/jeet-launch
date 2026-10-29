# JeeT Launch UX implementation specification

Status: specification plus limited safe improvements; not a completed trading UI.
Keep the dark/neon-green theme and existing JeeT Cat assets. Do not copy another
platform's logos, protected assets or imply affiliation.

## Shared navigation and capability gating

Mobile: Home/Explore, Create, portfolio/revenue; retain wallet/network in header.
Desktop: Explore, Create, Revenue, clear current network. All links must work.
Expose actual supported capabilities per launch version, deployment and network.
V5 not implemented means no enabled V5 sign/trade/graduation button. Never show
fake balances, generated price charts or fixture trading activity as live data.
Absent verified index means unavailable, not zero chain activity or a ranked list.

## Explore

Tabs: New (confirmed launch slot), Trending (documented rolling confirmed volume
and minimum observations), Final Stretch (net inventory progress), Graduated
(verified pool/LP evidence). Search ticker/name/mint with verified metadata and
mint identity; pagination with bounded queries and cache timestamps. Unknown
market cap, volume, holder counts or prices display unavailable, not zero.
Tokens with different units never share raw-unit ranking. Hide or label stale
rankings; errors have a bounded retry and last-confirmed timestamp.
Cards show image/name/ticker, network, spot estimate, confirmed volume period,
net curve progress and truthful graduation state. No synthetic integrity score.

## Token page

Identity and mint copy/explorer link; main chart and recent confirmed trades;
Buy/Sell panel; reserve and net progress; creator allocation; transparent fees;
protected-window slot boundary and wallet cap; graduation panel; integrity drawer.
Chart history uses actual events and documented pricing, gaps remain gaps.
Metadata is untrusted content: validate URI/image, safe links, escaped text and
loading failures. Display authority/mutability facts, never unaudited safety claims.

## Trading panel

One visible Buy/Sell switch, SOL/token entry, quick SOL presets, current balance,
slippage/max spend or minimum receive. Calculate purchasable lots using integer
binary search over on-chain cost; never round spending upward beyond user limit.
Show leftover budget and lot restriction in plain language. Token amount can show
normal tokens; internal base units belong in advanced details. Sell Max floors
to supported lots and explicitly shows fractional remainder retained by wallet.

Preview: raw consideration, 0.75% platform, 0.25% creator, actual rounded total,
full spend or net receive, separate estimated network/rent/setup costs. Expiring
quote binds nonce/state; chain quote is authoritative. Never show a chart price
as a guaranteed fill. Display cap remaining, protection status and balance impact.
Final-lot preview must highlight that successful atomic graduation ends curve
redemptions and moves trading to a verified AMM with normal price impact.

One deliberate signing action. States: input -> quote loading -> ready -> wallet
approval -> submitted/pending -> confirmed, or rejected/failed/unknown. Rejection
preserves inputs and offers a fresh quote. Confirmation timeout stays unknown
until original signature/blockhash status is resolved; do not resend blindly.
Wallet/network/input changes cancel outstanding reads and invalidate quotes.
Pending transactions prevent duplicate submission, not unrelated browsing.
After graduation switch venue only after verified pool state; label external
venue fees separately and do not claim continued 75/25 revenue there.

## Create Coin

Name, ticker, image, optional description/socials -> launch settings -> review ->
sign -> confirmation/integrity. Required inputs have labels, errors at field and
summary, sensible focus order. Ticker reservation is platform-only, not global
Solana uniqueness. Image upload is not metadata persistence; do not claim a real
metadata URI or immutability before confirmed on-chain verification.

Default creator 1% (0–5% advanced), explicit supply/decimals/admissible partitions,
caps, opening time/limits, economic version and authority choices. Review shows
creator/curve/migration quantities, rising curve endpoints, fees, trade lots,
terminal redemption policy and external setup funding obligations. No hidden
bundle or implied creator exemption. No signature before validation/review.
Refresh detects existing launch signature to prevent duplicate mint submissions.

## Revenue and integrity

Keep entitled signer claims bound to immutable beneficiaries. Separate accrued,
withdrawn and claimable values; paginated confirmed claim history, partial/full
claims and clear rejection states. Wrong wallet can view public data but cannot
initiate another beneficiary's claim. Treasury address is a beneficiary, not proof
of wallet control. Integrity lists actual PDAs, authorities, code/deployment IDs,
creator/cap/fee parameters and pool/LP transactions; unknown facts stay unknown.

## Mobile and accessibility acceptance

At 360/390/768/1440 CSS pixels: no horizontal overflow, no sticky bar hiding form
errors/signing conditions, touch controls approximately 44 px, readable numbers,
visible keyboard focus, semantic labels and announced async status. Mobile uses
a sticky Buy/Sell summary opening one panel, not nested modal stacks. Respect
reduced motion; no color-only success/error meaning. Test wallet rejection,
disconnect/switch during quote, delayed RPC, back navigation, keyboard-only flow
and confirmation recovery. These acceptance tests are required future browser
work; this specification does not assert they have all passed.

## Safe improvements in this checkpoint

Live listing export is empty until a verified index is connected; demo fixtures
are explicitly separated. Homepage removes invented launch/volume/trader totals
and uses fixed approved fee facts/network labels. The disconnected roast button
now links to the existing Revenue feature. Explore search is labeled, status
buttons expose pressed state and the unavailable-index message does not imply
zero chain launches. V5 remains gated. A real index, chart, V4/V5 trading panel,
metadata pipeline and mobile acceptance execution remain unfinished.
