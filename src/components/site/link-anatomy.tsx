/** Annotated share link: which part reaches the server and which never leaves the browser. */
export function LinkAnatomy() {
  return (
    <div className="border-border bg-card shadow-soft rounded-2xl border p-5">
      <div className="text-muted-foreground mb-3 text-xs font-medium tracking-wider uppercase">
        Anatomy of a link
      </div>
      <p className="bg-subtle rounded-lg px-3.5 py-3 font-mono text-[13px] leading-relaxed break-all">
        <span className="text-muted-foreground">https://vaultdrop.example/s/</span>
        <span className="text-foreground rounded bg-[#89b4fa]/15 px-0.5">
          Xk2pR7mQb9Lw4TzA1cVe0g
        </span>
        <span className="bg-primary-soft text-primary-soft-foreground rounded px-0.5 font-semibold">
          #M3f9Qa…Tz8a
        </span>
      </p>
      {/* dl > div > (dt, dd) only — the colour dot lives inside the dt to keep the list valid. */}
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="flex items-center gap-2.5 font-medium">
            <span aria-hidden className="size-2 shrink-0 rounded-full bg-[#89b4fa]" />
            Secret id
          </dt>
          <dd className="text-muted-foreground pl-[18px]">
            128-bit random. The only part sent to our servers.
          </dd>
        </div>
        <div>
          <dt className="flex items-center gap-2.5 font-medium">
            <span aria-hidden className="bg-primary size-2 shrink-0 rounded-full" />
            Decryption key
          </dt>
          <dd className="text-muted-foreground pl-[18px]">
            256-bit, after “#”. Browsers never send it in requests.
          </dd>
        </div>
      </dl>
    </div>
  );
}
