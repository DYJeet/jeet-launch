"use client";

import Image from "next/image";
import Link from "next/link";
import LocalTokenCreator from "@/components/LocalTokenCreator";
import WalletConnectButton from "@/components/WalletConnectButton";
import { toTokenBaseUnits } from "@/lib/token-amount";
import {validateImageUpload} from "@/lib/launch-image";
import type { ChangeEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

const LIME = "#9cff43";

function FeeDisclosure() {
  return (
<section aria-label="Platform fee disclosure" className="rounded-[22px] border border-[#9cff43]/20 bg-[#9cff43]/[0.04] p-5">
              <h2 className="text-sm font-black">Know the cost before signing</h2>
              <p className="mt-3 text-xs leading-5 text-white/60">Token creation platform fee: 0 SOL. Solana network costs and account rent are separate.</p>
              <p className="mt-2 text-xs leading-5 text-white/60">Supported curve trades charge 0.75% to JeeT Launch and 0.25% to the creator (1% nominal total). Integer rounding can increase the effective rate on small trades. Review the executable quote before signing.</p>
              <p className="mt-2 text-xs leading-5 text-white/45">V5 trading is available only in disposable local tests. Public V5 launches and graduation are disabled. Liquidity settings below are planning inputs; no migration charge or funding policy has been activated.</p>
              <Link href="/revenue" className="mt-3 inline-block text-xs font-bold text-[#9cff43] underline underline-offset-4">View on-chain fee accounts and claims</Link>
            </section>
  );
}

type ToggleProps = {
  checked: boolean;
  onChange: () => void;
  label: string;
};

function Toggle({ checked, onChange, label }: ToggleProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={checked}
      onClick={onChange}
      className={`relative h-6 w-11 shrink-0 rounded-full border transition ${
        checked
          ? "border-[#9cff43]/60 bg-[#9cff43]"
          : "border-white/10 bg-white/10"
      }`}
    >
      <span
        className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white shadow transition-all ${
          checked ? "left-6" : "left-1"
        }`}
      />
    </button>
  );
}

function FieldLabel({
  children,
  required,
}: {
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <span className="mb-2 block text-xs font-black text-white/80">
      {children}
      {required && <span className="ml-1 text-[#9cff43]">*</span>}
    </span>
  );
}

function SectionHeader({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="border-b border-white/[0.06] px-5 py-4">
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#9cff43] text-sm font-black text-black">
          {number}
        </span>

        <div>
          <h2 className="text-lg font-black">{title}</h2>
          <p className="mt-0.5 text-xs text-white/30">{description}</p>
        </div>
      </div>
    </div>
  );
}

function InputShell({
  children,
  error,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border bg-[#101411] transition ${
        error
          ? "border-red-400/50"
          : "border-white/[0.08] focus-within:border-[#9cff43]/50"
      }`}
    >
      {children}
    </div>
  );
}

function CheckLine({
  passed,
  text,
}: {
  passed: boolean;
  text: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-black ${
          passed
            ? "bg-[#9cff43] text-black"
            : "bg-white/10 text-white/30"
        }`}
      >
        {passed ? "✓" : "–"}
      </span>

      <span
        className={`text-xs leading-5 ${
          passed ? "text-white/65" : "text-white/30"
        }`}
      >
        {text}
      </span>
    </div>
  );
}

function isValidOptionalUrl(value: string) {
  if (!value.trim()) return true;

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export default function CreatePage() {
  const [tokenName, setTokenName] = useState("JeeT Cat");
  const [ticker, setTicker] = useState("JEET");

  const [description, setDescription] = useState(
    "The cat that launches fair. Community first. No bundles. Just JeeT."
  );

  const [website, setWebsite] = useState("https://jeetcat.xyz");
  const [twitter, setTwitter] = useState("https://x.com/jeetcat");
  const [telegram, setTelegram] = useState("https://t.me/jeetcat");

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [imageBusy,setImageBusy]=useState(false);
  const imageRequest=useRef(0),imageInput=useRef<HTMLInputElement>(null);
  useEffect(()=>()=>{imageRequest.current+=1;},[]);

  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoError, setLogoError] = useState("");

  const [totalSupply, setTotalSupply] = useState("1000000000");
  const [decimals, setDecimals] = useState("9");
  const [devAllocation, setDevAllocation] = useState("1");

  const [maxWalletPercent, setMaxWalletPercent] = useState("1");
  const [initialLiquidity, setInitialLiquidity] = useState("10");

  const [antiSniper, setAntiSniper] = useState(true);
  const [liquidityMode, setLiquidityMode] =
    useState<"lock" | "burn">("lock");

  const [revokeMint, setRevokeMint] = useState(true);
  const [revokeFreeze, setRevokeFreeze] = useState(true);

  const [reviewOpen, setReviewOpen] = useState(false);

  useEffect(() => {
    if (!logoPreview) return;
    return () => URL.revokeObjectURL(logoPreview);
  }, [logoPreview]);

  function removeLogo(){
    imageRequest.current+=1;setImageBusy(false);setLogoFile(null);setLogoPreview(null);setLogoError('');
    if(imageInput.current)imageInput.current.value='';
  }
  async function handleLogoUpload(event:ChangeEvent<HTMLInputElement>){
    const input=event.currentTarget,file=input.files?.[0],request=++imageRequest.current;
    setLogoError('');if(!file){removeLogo();return;}
    setImageBusy(true);
    try{await validateImageUpload(file);if(request!==imageRequest.current)return;setLogoFile(file);setLogoPreview(URL.createObjectURL(file));}
    catch(error){if(request===imageRequest.current){setLogoError(error instanceof Error?error.message:String(error));input.value='';}}
    finally{if(request===imageRequest.current)setImageBusy(false);}
  }

   const supplyNumber = Number(totalSupply);
  const decimalsNumber = Number(decimals);
  const devNumber = Number(devAllocation);
  const walletCapNumber = Number(maxWalletPercent);
  const liquidityNumber = Number(initialLiquidity);
  const baseUnitAmount = toTokenBaseUnits(totalSupply, decimalsNumber);

  const nameValid =
    tokenName.trim().length >= 2 &&
    new TextEncoder().encode(tokenName.trim()).length <= 32 &&
    !/\p{Cc}/u.test(tokenName);

  const tickerValid = /^[A-Z0-9]{2,10}$/.test(ticker);

  const descriptionValid =
    description.trim().length >= 10 &&
    description.trim().length <= 500;

  const supplyValid =
    Number.isFinite(supplyNumber) &&
    Number.isInteger(supplyNumber) &&
    supplyNumber > 0 &&
    supplyNumber <= 1_000_000_000_000_000 &&
    baseUnitAmount.ok;

  const decimalsValid =
    Number.isInteger(decimalsNumber) &&
    decimalsNumber >= 0 &&
    decimalsNumber <= 9;

  const devValid =
    Number.isFinite(devNumber) &&
    devNumber >= 0 &&
    devNumber <= 5;

  const walletCapValid =
    Number.isFinite(walletCapNumber) &&
    walletCapNumber >= 0.1 &&
    walletCapNumber <= 5;

  const liquidityValid =
    Number.isFinite(liquidityNumber) &&
    liquidityNumber >= 1;

  const websiteValid = isValidOptionalUrl(website);
  const twitterValid = isValidOptionalUrl(twitter);
  const telegramValid = isValidOptionalUrl(telegram);

  const tokenInfoValid =
    nameValid &&
    tickerValid &&
    descriptionValid &&
    websiteValid &&
    twitterValid &&
    telegramValid;

  const tokenomicsValid =
    supplyValid &&
    decimalsValid &&
    devValid;

  const launchSettingsValid =
    walletCapValid &&
    liquidityValid;

  const formValid =
    tokenInfoValid &&
    tokenomicsValid &&
    launchSettingsValid && !imageBusy && !logoError;

  const integrityScore = useMemo(() => {
    let score = 20;

    if (nameValid && tickerValid && descriptionValid) {
      score += 10;
    }

    if (devValid) {
      score += devNumber <= 2.5 ? 15 : 8;
    }

    if (walletCapValid) {
      score += walletCapNumber <= 2 ? 15 : 8;
    }

    if (antiSniper) score += 10;

    if (liquidityMode === "lock" || liquidityMode === "burn") {
      score += 10;
    }

    if (revokeMint) score += 10;
    if (revokeFreeze) score += 10;

    return Math.min(score, 100);
  }, [
    antiSniper,
    descriptionValid,
    devNumber,
    devValid,
    liquidityMode,
    nameValid,
    revokeFreeze,
    revokeMint,
    tickerValid,
    walletCapNumber,
    walletCapValid,
  ]);

  const integrityLabel =
    integrityScore >= 90
      ? "Excellent"
      : integrityScore >= 80
        ? "Strong"
        : integrityScore >= 70
          ? "Fair"
          : "Needs Work";

  const integrityTextColor =
    integrityScore >= 90
      ? "text-[#9cff43]"
      : integrityScore >= 80
        ? "text-green-300"
        : integrityScore >= 70
          ? "text-yellow-300"
          : "text-orange-400";

  const launchFee = 0;
  const estimatedNetworkFee = 0.01;

  const estimatedWalletRequirement =
    Math.max(liquidityNumber || 0, 0) +
    launchFee +
    estimatedNetworkFee;

  const formattedSupply =
    supplyValid && supplyNumber < Number.MAX_SAFE_INTEGER
      ? supplyNumber.toLocaleString()
      : totalSupply || "—";


       return (
    <main className="min-h-screen bg-[#050605] text-white">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute left-1/2 top-[-240px] h-[620px] w-[620px] -translate-x-1/2 rounded-full bg-[#9cff43]/[0.06] blur-[150px]" />
      </div>

      {/* HEADER */}
      <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-[#050605]/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-5 py-4 lg:px-8">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#9cff43]/20 bg-[#9cff43]/10 text-xl">
              🐱
            </div>

            <div>
              <p className="text-xl font-black tracking-tight">
                JeeT{" "}
                <span className="text-[#9cff43]">Launch</span>
              </p>

              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/25">
                Built for fair launches
              </p>
            </div>
          </Link>

          <nav className="hidden items-center gap-7 text-sm font-semibold text-white/45 lg:flex">
            <Link href="/" className="transition hover:text-white">
              Explore
            </Link>

            <span className="border-b-2 border-[#9cff43] pb-2 text-white">
              Create
            </span>

            <span>Leaderboard</span>
            <span>Docs</span>
          </nav>

          <WalletConnectButton />
        </div>
      </header>

      {/* HERO */}
      <section className="border-b border-white/[0.06]">
        <div className="mx-auto grid max-w-[1600px] gap-8 px-5 py-8 lg:grid-cols-[1fr_auto] lg:px-8">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#9cff43]">
              Create on JeeT
            </p>

            <h1 className="mt-2 text-5xl font-black leading-[0.96] tracking-[-0.05em] sm:text-6xl">
              Launch a{" "}
              <span className="text-[#9cff43]">Coin</span>
            </h1>

            <p className="mt-4 max-w-2xl text-base leading-7 text-white/45">
              Create a transparent Solana launch with disclosed allocation,
              wallet caps, launch protections and a public integrity report.
            </p>
          </div>

          <div className="relative hidden min-w-[350px] items-end justify-center lg:flex">
            <div className="absolute bottom-0 h-28 w-52 rounded-full bg-[#9cff43]/10 blur-3xl" />

            <Image
              src="/jeet-promo.png"
              alt="JeeT the Cat"
              width={155}
              height={180}
              priority
              className="relative z-10 h-[160px] w-auto object-contain"
            />

            <div className="relative z-20 mb-14 ml-[-5px] rotate-[-3deg] rounded-xl border-2 border-black bg-white px-4 py-3 text-black shadow-xl">
              <p className="text-sm font-black leading-tight">
                KEEP IT FAIR.
                <br />
                KEEP IT JEEТ.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* TRUST STRIP */}
      <section className="border-b border-white/[0.06] bg-white/[0.012]">
        <div className="mx-auto grid max-w-[1600px] grid-cols-2 lg:grid-cols-4">
          {[
            ["🛡", "Fair launch settings", "Same rules for everyone."],
            ["◎", "No hidden bundles", "Transparent launch structure."],
            ["◔", "Disclosed allocation", "Dev supply shown publicly."],
            ["🔒", "Wallet caps", "Limits early concentration."],
          ].map(([icon, title, detail]) => (
            <div
              key={title}
              className="border-r border-white/[0.05] px-5 py-4 lg:px-8"
            >
              <div className="flex gap-3">
                <span className="text-2xl">{icon}</span>

                <div>
                  <p className="text-sm font-black">{title}</p>
                  <p className="mt-1 text-xs text-white/30">{detail}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* MAIN GRID */}
      <section className="mx-auto grid max-w-[1600px] gap-5 px-5 py-6 lg:px-8 xl:grid-cols-[190px_minmax(0,1fr)_390px]">
        {/* LEFT STEP NAV */}
        <aside className="hidden xl:block">
          <div className="sticky top-28 rounded-[22px] border border-white/[0.07] bg-[#090b09] p-5">
            {[
              ["1", "Token Info", "Identity and socials", "#token-info"],
              ["2", "Tokenomics", "Supply and allocation", "#tokenomics"],
              ["3", "Launch Settings", "Protection and limits", "#launch-settings"],
              ["4", "Review & Launch", "Final checks", "#review"],
            ].map(([number, title, subtitle, href], index) => (
              <a
                href={href}
                key={number}
                className={`relative flex gap-3 ${
                  index !== 3 ? "pb-8" : ""
                }`}
              >
                {index !== 3 && (
                  <div className="absolute left-[15px] top-8 h-[calc(100%-18px)] w-px bg-white/10" />
                )}

                <div
                  className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-black ${
                    index === 0
                      ? "border-[#9cff43] bg-[#9cff43] text-black"
                      : "border-white/15 bg-[#0d110e] text-white/50"
                  }`}
                >
                  {number}
                </div>

                <div>
                  <p className="text-sm font-black">{title}</p>
                  <p className="mt-1 text-[11px] leading-4 text-white/28">
                    {subtitle}
                  </p>
                </div>
              </a>
            ))}
          </div>
        </aside>

        {/* CENTER FORM */}
        <div className="space-y-4">
             {/* STEP 1 — TOKEN INFORMATION */}
          <section
            id="token-info"
            className="scroll-mt-28 overflow-hidden rounded-[22px] border border-white/[0.07] bg-[#090b09]"
          >
            <SectionHeader
              number="1"
              title="Token Information"
              description="Set your token identity, artwork, and social links."
            />

            <div className="grid gap-5 p-5 md:grid-cols-2">
              <label>
                <FieldLabel required>Token Name</FieldLabel>

                <InputShell
                  error={tokenName.length > 0 && !nameValid}
                >
                  <div className="relative">
                    <input
                      value={tokenName}
                      maxLength={32}
                      onChange={(event) =>
                        setTokenName(event.target.value)
                      }
                      placeholder="JeeT Cat"
                      className="w-full bg-transparent px-4 py-3 pr-16 outline-none"
                    />

                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-white/25">
                      {tokenName.length}/32
                    </span>
                  </div>
                </InputShell>

                {tokenName.length > 0 && !nameValid && (
                  <p className="mt-2 text-[10px] text-red-300">
                    Use 2–32 characters.
                  </p>
                )}
              </label>

              <label>
                <FieldLabel required>Ticker</FieldLabel>

                <InputShell
                  error={ticker.length > 0 && !tickerValid}
                >
                  <div className="relative">
                    <input
                      value={ticker}
                      maxLength={10}
                      onChange={(event) =>
                        setTicker(
                          event.target.value
                            .replace(/[^a-zA-Z0-9]/g, "")
                            .toUpperCase()
                        )
                      }
                      placeholder="JEET"
                      className="w-full bg-transparent px-4 py-3 pr-16 outline-none"
                    />

                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-white/25">
                      {ticker.length}/10
                    </span>
                  </div>
                </InputShell>

                {tickerValid ? (
                  <p className="mt-2 text-[10px] font-bold text-[#9cff43]">
                    ✓ Ticker format valid
                  </p>
                ) : ticker.length > 0 ? (
                  <p className="mt-2 text-[10px] text-red-300">
                    Use 2–10 letters or numbers.
                  </p>
                ) : null}

                <p className="mt-1 text-[9px] text-white/20">
                  Actual ticker availability will be checked
                  once the backend is connected.
                </p>
              </label>

              <label className="md:col-span-2">
                <FieldLabel required>Description</FieldLabel>

                <InputShell
                  error={
                    description.length > 0 &&
                    !descriptionValid
                  }
                >
                  <div className="relative">
                    <textarea
                      value={description}
                      maxLength={500}
                      rows={4}
                      onChange={(event) =>
                        setDescription(event.target.value)
                      }
                      placeholder="Tell the community what you're launching..."
                      className="w-full resize-none bg-transparent px-4 py-3 pb-7 outline-none"
                    />

                    <span className="absolute bottom-3 right-3 text-[10px] text-white/25">
                      {description.length}/500
                    </span>
                  </div>
                </InputShell>
              
              {description.length > 0 && !descriptionValid && (
                  <p className="mt-2 text-[10px] text-red-300">
                    Description must be at least 10 characters.
                  </p>
                )}
              </label>

              {/* TOKEN LOGO */}
              <div className="md:col-span-2">
                <FieldLabel>Token Logo</FieldLabel>

                <div className="flex flex-col gap-4 rounded-xl border border-dashed border-white/[0.12] bg-[#101411] p-4 sm:flex-row sm:items-center">
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-[#090b09]">
                    {logoPreview ? (
                      <Image
                        width={80}
                        height={80}
                        unoptimized
                        src={logoPreview}
                        alt="Token logo preview"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-3xl">🐱</span>
                    )}
                  </div>

                  <div>
                    <label className="inline-block cursor-pointer rounded-xl border border-white/[0.09] bg-white/[0.04] px-4 py-2.5 text-xs font-black transition hover:bg-white/[0.07]">
                      {logoFile ? "Change Image" : "Upload Image"}

                      <input
                        type="file"
                        ref={imageInput}
                        aria-label="Token logo image"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={handleLogoUpload}
                        className="hidden"
                      />
                    </label>

                    <p className="mt-2 text-[10px] text-white/25">
                      PNG, JPG, or WEBP. Maximum 2 MB and 4096 pixels per side. Square image recommended.
                    </p>

                    {imageBusy && <p role="status" className="mt-2 text-[10px] text-white/50">Checking image…</p>}
                    {(logoFile||logoError) && <button type="button" aria-label="Remove token logo" onClick={removeLogo} className="mt-2 text-[10px] text-white/50 hover:text-[#9cff43]">Remove image</button>}
                    {logoError && (
                      <p className="mt-2 text-[10px] text-red-300">
                        {logoError}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* WEBSITE */}
              <label>
                <FieldLabel>Website</FieldLabel>

                <InputShell error={!websiteValid}>
                  <input
                    type="url"
                    value={website}
                    onChange={(event) =>
                      setWebsite(event.target.value)
                    }
                    placeholder="https://yourproject.xyz"
                    className="w-full bg-transparent px-4 py-3 text-sm outline-none"
                  />
                </InputShell>

                {!websiteValid && (
                  <p className="mt-2 text-[10px] text-red-300">
                    Enter a valid URL including https://
                  </p>
                )}
              </label>

              {/* X / TWITTER */}
              <label>
                <FieldLabel>X / Twitter</FieldLabel>

                <InputShell error={!twitterValid}>
                  <input
                    type="url"
                    value={twitter}
                    onChange={(event) =>
                      setTwitter(event.target.value)
                    }
                    placeholder="https://x.com/project"
                    className="w-full bg-transparent px-4 py-3 text-sm outline-none"
                  />
                </InputShell>

                {!twitterValid && (
                  <p className="mt-2 text-[10px] text-red-300">
                    Enter a valid URL including https://
                  </p>
                )}
              </label>

              {/* TELEGRAM */}
              <label className="md:col-span-2">
                <FieldLabel>Telegram</FieldLabel>

                <InputShell error={!telegramValid}>
                  <input
                    type="url"
                    value={telegram}
                    onChange={(event) =>
                      setTelegram(event.target.value)
                    }
                    placeholder="https://t.me/project"
                    className="w-full bg-transparent px-4 py-3 text-sm outline-none"
                  />
                </InputShell>

                {!telegramValid && (
                  <p className="mt-2 text-[10px] text-red-300">
                    Enter a valid URL including https://
                  </p>
                )}
              </label>
            </div>
          </section>

           {/* STEP 2 — TOKENOMICS */}
          <section
            id="tokenomics"
            className="scroll-mt-28 overflow-hidden rounded-[22px] border border-white/[0.07] bg-[#090b09]"
          >
            <SectionHeader
              number="2"
              title="Tokenomics"
              description="Configure token supply and disclosed creator allocation."
            />

            <div className="grid gap-5 p-5 md:grid-cols-3">
              {/* TOTAL SUPPLY */}
              <label>
                <FieldLabel required>Total Supply</FieldLabel>

                <InputShell error={!supplyValid}>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={totalSupply}
                    onChange={(event) =>
                      setTotalSupply(event.target.value)
                    }
                    className="w-full bg-transparent px-4 py-3 outline-none"
                  />
                </InputShell>

                <p className={`mt-2 text-[10px] ${supplyValid ? "text-white/25" : "text-red-300"}`}>
                  {supplyValid
                    ? `Display: ${formattedSupply}`
                    : baseUnitAmount.ok
                      ? "Supply must be a positive whole number."
                      : baseUnitAmount.message}
                </p>
              </label>

              {/* DECIMALS */}
              <label>
                <FieldLabel required>Decimals</FieldLabel>

                <InputShell error={!decimalsValid}>
                  <input
                    type="number"
                    min="0"
                    max="9"
                    step="1"
                    value={decimals}
                    onChange={(event) =>
                      setDecimals(event.target.value)
                    }
                    className="w-full bg-transparent px-4 py-3 outline-none"
                  />
                </InputShell>

                <p className="mt-2 text-[10px] text-white/25">
                  9 is standard for many Solana tokens.
                </p>
              </label>

              {/* DEV ALLOCATION */}
              <label>
                <FieldLabel required>Dev Allocation (%)</FieldLabel>

                <InputShell error={!devValid}>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      max="5"
                      step="0.1"
                      value={devAllocation}
                      onChange={(event) =>
                        setDevAllocation(event.target.value)
                      }
                      className="w-full bg-transparent px-4 py-3 pr-10 outline-none"
                    />

                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30">
                      %
                    </span>
                  </div>
                </InputShell>

                <p
                  className={`mt-2 text-[10px] ${
                    devValid
                      ? devNumber <= 2.5
                        ? "text-[#9cff43]"
                        : "text-yellow-300"
                      : "text-red-300"
                  }`}
                >
                  {!devValid
                    ? "Maximum creator allocation is 5%."
                    : devNumber <= 2.5
                      ? "✓ Strong fair-launch allocation"
                      : "Allowed, but lowers integrity."}
                </p>
              </label>

              {/* TRANSPARENCY NOTE */}
              <div className="md:col-span-3 rounded-xl border border-[#9cff43]/10 bg-[#9cff43]/[0.035] p-4">
                <div className="flex gap-3">
                  <span className="text-xl">◎</span>

                  <div>
                    <p className="text-xs font-black">
                      Transparent by design
                    </p>

                    <p className="mt-1 text-xs leading-5 text-white/35">
                      Creator allocation will be shown publicly on JeeT Launch.
                      Hidden dev allocations are not part of the fair-launch model.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

           {/* STEP 3 — LAUNCH SETTINGS */}
          <section
            id="launch-settings"
            className="scroll-mt-28 overflow-hidden rounded-[22px] border border-white/[0.07] bg-[#090b09]"
          >
            <SectionHeader
              number="3"
              title="Launch Settings"
              description="Configure wallet limits, liquidity, and fair-launch protections."
            />

            <div className="grid gap-4 p-5 md:grid-cols-2">
              {/* OPENING WALLET CAP */}
              <label className="rounded-xl border border-white/[0.07] bg-[#101411] p-4">
                <FieldLabel required>Opening Wallet Cap</FieldLabel>

                <div className="relative">
                  <input
                    type="number"
                    min="0.1"
                    max="5"
                    step="0.1"
                    value={maxWalletPercent}
                    onChange={(event) =>
                      setMaxWalletPercent(event.target.value)
                    }
                    className="w-full rounded-lg border border-white/[0.08] bg-black/20 px-4 py-3 pr-10 outline-none focus:border-[#9cff43]/40"
                  />

                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30">
                    %
                  </span>
                </div>

                <p
                  className={`mt-2 text-[10px] ${
                    walletCapValid
                      ? walletCapNumber <= 2
                        ? "text-[#9cff43]"
                        : "text-yellow-300"
                      : "text-red-300"
                  }`}
                >
                  {!walletCapValid
                    ? "Wallet cap must be between 0.1% and 5%."
                    : walletCapNumber <= 2
                      ? "✓ Strong anti-whale setting"
                      : "Allowed, but less restrictive."}
                </p>
              </label>

              {/* INITIAL LIQUIDITY */}
              <label className="rounded-xl border border-white/[0.07] bg-[#101411] p-4">
                <FieldLabel required>Initial Liquidity</FieldLabel>

                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    step="0.1"
                    value={initialLiquidity}
                    onChange={(event) =>
                      setInitialLiquidity(event.target.value)
                    }
                    className="w-full rounded-lg border border-white/[0.08] bg-black/20 px-4 py-3 pr-14 outline-none focus:border-[#9cff43]/40"
                  />

                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30">
                    SOL
                  </span>
                </div>

                <p className="mt-2 text-[10px] text-white/25">
                  Minimum 1 SOL in the V1 interface.
                </p>
              </label>

              {/* ANTI-SNIPER */}
              <div className="flex items-start justify-between gap-4 rounded-xl border border-white/[0.07] bg-[#101411] p-4">
                <div>
                  <p className="text-sm font-black">
                    Anti-Sniper Protection
                  </p>

                  <p className="mt-1 text-xs leading-5 text-white/30">
                    Intended to reduce automated opening abuse and bot domination.
                  </p>
                </div>

                <Toggle
                  checked={antiSniper}
                  onChange={() =>
                    setAntiSniper((value) => !value)
                  }
                  label="Toggle anti-sniper protection"
                />
              </div>

              {/* REVOKE MINT */}
              <div className="flex items-start justify-between gap-4 rounded-xl border border-white/[0.07] bg-[#101411] p-4">
                <div>
                  <p className="text-sm font-black">
                    Revoke Mint Authority
                  </p>

                  <p className="mt-1 text-xs leading-5 text-white/30">
                    Prevent additional token supply from being minted after launch.
                  </p>
                </div>

                <Toggle
                  checked={revokeMint}
                  onChange={() =>
                    setRevokeMint((value) => !value)
                  }
                  label="Toggle mint authority revocation"
                />
              </div>

              {/* REVOKE FREEZE */}
              <div className="flex items-start justify-between gap-4 rounded-xl border border-white/[0.07] bg-[#101411] p-4">
                <div>
                  <p className="text-sm font-black">
                    Revoke Freeze Authority
                  </p>

                  <p className="mt-1 text-xs leading-5 text-white/30">
                    Prevent the creator from freezing user token accounts.
                  </p>
                </div>

                <Toggle
                  checked={revokeFreeze}
                  onChange={() =>
                    setRevokeFreeze((value) => !value)
                  }
                  label="Toggle freeze authority revocation"
                />
              </div>

              {/* LIQUIDITY MODE */}
              <div className="rounded-xl border border-white/[0.07] bg-[#101411] p-4">
                <p className="text-sm font-black">
                  Liquidity Protection
                </p>

                <p className="mt-1 text-xs text-white/30">
                  Choose the intended treatment of launch liquidity.
                </p>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setLiquidityMode("lock")}
                    className={`rounded-lg border px-3 py-3 text-xs font-black transition ${
                      liquidityMode === "lock"
                        ? "border-[#9cff43] bg-[#9cff43] text-black"
                        : "border-white/[0.08] bg-black/20 text-white/50"
                    }`}
                  >
                    🔒 Lock
                  </button>

                  <button
                    type="button"
                    onClick={() => setLiquidityMode("burn")}
                    className={`rounded-lg border px-3 py-3 text-xs font-black transition ${
                      liquidityMode === "burn"
                        ? "border-[#9cff43] bg-[#9cff43] text-black"
                        : "border-white/[0.08] bg-black/20 text-white/50"
                    }`}
                  >
                    🔥 Burn
                  </button>
                </div>
              </div>
            </div>
          </section>

           {/* MOBILE REVIEW */}
          <section
            id="review"
            className="scroll-mt-28 space-y-4 xl:hidden"
          >
            <FeeDisclosure />
            <div className="rounded-[22px] border border-white/[0.07] bg-[#090b09] p-5">
              <p className="text-lg font-black">
                Ready to review?
              </p>

              <p className="mt-2 text-sm text-white/35">
                Current JeeT Integrity Score:{" "}
                <span
                  className={`font-black ${integrityTextColor}`}
                >
                  {integrityScore}/100
                </span>
              </p>

              <button
                type="button"
                disabled={!formValid}
                onClick={() => setReviewOpen(true)}
                className={`mt-5 w-full rounded-xl py-3.5 font-black transition ${
                  formValid
                    ? "bg-[#9cff43] text-black"
                    : "cursor-not-allowed bg-white/10 text-white/25"
                }`}
              >
                Review Launch →
              </button>

              {!formValid && (
                <p className="mt-3 text-center text-[10px] text-white/25">
                  Fix highlighted fields before continuing.
                </p>
              )}
            </div>
          </section>
        </div>

        {/* RIGHT REVIEW SIDEBAR */}
        <aside className="hidden xl:block">
          <div className="sticky top-28 space-y-4">
            {/* TOKEN PREVIEW */}
            <section className="rounded-[22px] border border-white/[0.07] bg-[#090b09] p-5">
              <div className="flex items-center justify-between">
                <p className="text-lg font-black">
                  Token Preview
                </p>

                <span className="rounded-full border border-[#9cff43]/20 bg-[#9cff43]/10 px-2.5 py-1 text-[9px] font-black text-[#9cff43]">
                  PREVIEW
                </span>
              </div>

              <div className="mt-5 flex gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#9cff43]/20 bg-[#9cff43]/10">
                  {logoPreview ? (
                    <Image
                        width={80}
                        height={80}
                        unoptimized
                      src={logoPreview}
                      alt="Token preview"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-3xl">
                      🐱
                    </span>
                  )}
                </div>

                <div className="min-w-0">
                  <p className="truncate text-xl font-black">
                    {tokenName || "Unnamed Token"}
                  </p>

                  <p className="mt-0.5 font-black text-[#9cff43]">
                    ${ticker || "TICKER"}
                  </p>

                  <p className="mt-2 text-xs leading-5 text-white/35">
                    {description ||
                      "Your token description will appear here."}
                  </p>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
                  <p className="text-[9px] uppercase tracking-wider text-white/20">
                    Supply
                  </p>

                  <p className="mt-1 text-xs font-black">
                    {formattedSupply}
                  </p>
                </div>

                <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
                  <p className="text-[9px] uppercase tracking-wider text-white/20">
                    Dev Allocation
                  </p>

                  <p className="mt-1 text-xs font-black">
                    {devValid ? `${devNumber}%` : "—"}
                  </p>
                </div>
              </div>
            </section>

            {/* INTEGRITY REPORT */}
            <section className="rounded-[22px] border border-white/[0.07] bg-[#090b09] p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-lg font-black">
                    Launch Integrity
                  </p>

                  <p className="mt-1 text-[10px] text-white/25">
                    Based on current launch settings
                  </p>
                </div>

                <span
                  className={`rounded-full border border-white/10 px-3 py-1 text-[10px] font-black ${integrityTextColor}`}
                >
                  {integrityLabel}
                </span>
              </div>

              <div className="mt-5 grid grid-cols-[110px_1fr] items-center gap-5">
                {/* SCORE RING */}
                <div
                  className="relative flex h-[108px] w-[108px] items-center justify-center rounded-full"
                  style={{
                    background: `conic-gradient(${LIME} ${
                      integrityScore * 3.6
                    }deg, rgba(255,255,255,0.08) 0deg)`,
                  }}
                >
                  <div className="flex h-[82px] w-[82px] flex-col items-center justify-center rounded-full bg-[#090b09]">
                    <span className="text-2xl font-black">
                      {integrityScore}
                    </span>

                    <span className="text-[10px] text-white/30">
                      / 100
                    </span>
                  </div>
                </div>

                {/* CHECKS */}
                <div className="space-y-2">
                  <CheckLine
                    passed={devValid}
                    text="Creator allocation ≤ 5%"
                  />

                  <CheckLine
                    passed={devValid && devNumber <= 2.5}
                    text="Creator allocation ≤ 2.5%"
                  />

                  <CheckLine
                    passed={
                      walletCapValid &&
                      walletCapNumber <= 2
                    }
                    text="Opening wallet cap ≤ 2%"
                  />

                  <CheckLine
                    passed={antiSniper}
                    text="Anti-sniper enabled"
                  />

                  <CheckLine
                    passed={revokeMint}
                    text="Mint authority revoked"
                  />

                  <CheckLine
                    passed={revokeFreeze}
                    text="Freeze authority revoked"
                  />
                </div>
              </div>

              <div className="mt-5 rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-white/35">
                    Liquidity protection
                  </span>

                  <span className="text-xs font-black text-[#9cff43]">
                    {liquidityMode === "lock"
                      ? "LOCK"
                      : "BURN"}
                  </span>
                </div>
              </div>
            </section>

            <FeeDisclosure />

            {/* FEE SUMMARY */}
            <section className="rounded-[22px] border border-white/[0.07] bg-[#090b09] p-5">
              <p className="text-lg font-black">
                Estimated Cost
              </p>

              <div className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-white/35">
                    Initial liquidity
                  </span>

                  <span className="font-bold">
                    {liquidityValid
                      ? liquidityNumber.toFixed(2)
                      : "—"}{" "}
                    SOL
                  </span>
                </div>

                <div className="flex justify-between gap-4">
                  <span className="text-white/35">
                    Launch fee
                  </span>

                  <span className="font-bold">
                    {launchFee.toFixed(2)} SOL
                  </span>
                </div>

                <div className="flex justify-between gap-4">
                  <span className="text-white/35">
                    Est. network fee
                  </span>

                  <span className="font-bold">
                    ~{estimatedNetworkFee.toFixed(2)} SOL
                  </span>
                </div>

                <div className="border-t border-white/[0.07] pt-3">
                  <div className="flex items-end justify-between gap-4">
                    <span className="max-w-[160px] font-black">
                      Estimated wallet requirement
                    </span>

                    <span className="text-xl font-black text-[#9cff43]">
                      ~{estimatedWalletRequirement.toFixed(2)} SOL
                    </span>
                  </div>
                </div>
              </div>

              <p className="mt-4 text-[9px] leading-4 text-white/20">
                V1 interface estimate. Production will use live
                Solana transaction simulation before the wallet
                signs anything.
              </p>
            </section>

            {/* REVIEW BUTTON */}
            <button
              type="button"
              disabled={!formValid}
              onClick={() => setReviewOpen(true)}
              className={`w-full rounded-xl py-4 font-black transition ${
                formValid
                  ? "bg-[#9cff43] text-black shadow-[0_0_30px_rgba(156,255,67,0.12)] hover:brightness-105"
                  : "cursor-not-allowed bg-white/10 text-white/25"
              }`}
            >
              {formValid
                ? "Review & Launch →"
                : "Complete Required Fields"}
            </button>

            {!formValid && (
              <p className="text-center text-[10px] text-white/25">
                Fix highlighted fields before continuing.
              </p>
            )}

            <p className="text-center text-[9px] leading-4 text-white/20">
              Review offers separate local-validator and Devnet tests. Public V5 trading and
              liquidity migration remain disabled; each test explains what it verifies.
            </p>
          </div>
        </aside>
      </section>

      {/* REVIEW MODAL */}
      {reviewOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[26px] border border-white/[0.09] bg-[#090b09] shadow-2xl">
            {/* MODAL HEADER */}
            <div className="flex items-start justify-between border-b border-white/[0.06] p-5 sm:p-6">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#9cff43]">
                  Final Review
                </p>

                <h2 className="mt-1 text-2xl font-black">
                  Review your launch
                </h2>

                <p className="mt-1 text-xs text-white/30">
                  Devnet test minting is available below after wallet connection.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setReviewOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-xl text-white/50 transition hover:text-white"
              >
                ×
              </button>
            </div>

            <div className="space-y-5 p-5 sm:p-6">
              {/* TOKEN IDENTITY */}
              <div className="flex items-center gap-4 rounded-2xl border border-white/[0.07] bg-[#101411] p-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#9cff43]/20 bg-[#9cff43]/10">
                  {logoPreview ? (
                    <Image
                        width={80}
                        height={80}
                        unoptimized
                      src={logoPreview}
                      alt="Token"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-3xl">🐱</span>
                  )}
                </div>

                <div className="min-w-0">
                  <p className="truncate text-xl font-black">
                    {tokenName}
                  </p>

                  <p className="font-black text-[#9cff43]">
                    ${ticker}
                  </p>

                  <p className="mt-1 text-xs text-white/30">
                    {formattedSupply} supply · {decimalsNumber} decimals
                  </p>
                </div>
              </div>

              {/* DESCRIPTION */}
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-4">
                <p className="text-[10px] font-black uppercase tracking-wider text-white/20">
                  Description
                </p>

                <p className="mt-2 text-sm leading-6 text-white/55">
                  {description}
                </p>
              </div>

              {/* SETTINGS SUMMARY */}
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ["Dev Allocation", `${devNumber}%`],
                  ["Wallet Cap", `${walletCapNumber}%`],
                  ["Initial Liquidity", `${liquidityNumber} SOL`],
                  [
                    "Anti-Sniper",
                    antiSniper ? "Enabled" : "Disabled",
                  ],
                  [
                    "Liquidity",
                    liquidityMode === "lock" ? "Locked" : "Burned",
                  ],
                  [
                    "Mint Authority",
                    revokeMint ? "Will revoke" : "Retained",
                  ],
                  [
                    "Freeze Authority",
                    revokeFreeze ? "Will revoke" : "Retained",
                  ],
                  ["Decimals", String(decimalsNumber)],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-4"
                  >
                    <p className="text-[10px] font-black uppercase tracking-wider text-white/20">
                      {label}
                    </p>

                    <p className="mt-1 font-black">
                      {value}
                    </p>
                  </div>
                ))}
              </div>

              {/* INTEGRITY SCORE */}
              <div className="flex items-center justify-between rounded-2xl border border-[#9cff43]/15 bg-[#9cff43]/[0.04] p-5">
                <div>
                  <p className="text-xs font-black">
                    JeeT Integrity Score
                  </p>

                  <p className="mt-1 text-xs text-white/30">
                    {integrityLabel} launch configuration
                  </p>
                </div>

                <p
                  className={`text-3xl font-black ${integrityTextColor}`}
                >
                  {integrityScore}
                  <span className="text-sm text-white/25">
                    /100
                  </span>
                </p>
              </div>

              {/* COST */}
              <div className="flex items-end justify-between gap-5 rounded-2xl border border-white/[0.07] bg-[#101411] p-5">
                <div>
                  <p className="text-xs font-black">
                    Estimated wallet requirement
                  </p>

                  <p className="mt-1 text-[10px] text-white/25">
                    Liquidity + current estimated fees
                  </p>
                </div>

                <p className="text-xl font-black text-[#9cff43]">
                  ~{estimatedWalletRequirement.toFixed(2)} SOL
                </p>
              </div>

              {/* LOCAL VALIDATOR TOKEN CREATION */}
              <LocalTokenCreator
                tokenName={tokenName}
                ticker={ticker}
                totalSupply={totalSupply}
                decimals={decimalsNumber}
                devAllocation={devAllocation}
                maxWalletPercent={maxWalletPercent}
                protectedOpeningEnabled={antiSniper}
                revokeMint={revokeMint}
                revokeFreeze={revokeFreeze}
              />

              <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4">
                <p className="text-xs font-black text-white/70">
                  Production launch rules still come next
                </p>
                <p className="mt-2 text-xs leading-5 text-white/35">
                  The local test verifies creator allocation, PDA custody, cumulative wallet caps,
                  deterministic buy pricing and selected protected-opening rules on-chain. Liquidity
                  migration and ticker reservation remain later features. This is a local validator
                  proof, separate from the Devnet wallet integration below.
                </p>
              </div>

              {/* MODAL BUTTONS */}
              <button
                type="button"
                onClick={() => setReviewOpen(false)}
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] py-3.5 font-black text-white/60 transition hover:bg-white/[0.07]"
              >
                ← Keep Editing
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}