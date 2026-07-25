'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { EmptyState, Field, PageHeader, formatAgo } from '@/components/ui';
import { AssetThumb } from '@/components/brand/AssetThumb';
import { VOICE_OPTIONS, type AssetKind, type BrandColor } from '@/lib/brand/types';
import { useBrandStore } from '@/lib/stores/useBrandStore';

const KIND_LABELS: { kind: AssetKind; label: string; hint: string }[] = [
  { kind: 'logo', label: 'Logos', hint: 'Animated in logo stings' },
  { kind: 'product', label: 'Product shots', hint: 'Animated in product spotlights' },
  { kind: 'lifestyle', label: 'Lifestyle', hint: 'Seeds mood films' },
  { kind: 'font', label: 'Fonts', hint: 'Stored for reference' },
  { kind: 'other', label: 'Other', hint: '' },
];

function PackageDropzone({ kitId }: { kitId: string | null }) {
  const importPackage = useBrandStore((s) => s.importPackage);
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      setBusy(true);
      setMessages([]);
      try {
        const { kit, warnings } = await importPackage(kitId, files);
        setMessages([`Imported into “${kit.name}”.`, ...warnings]);
      } catch (err) {
        setMessages([`Import failed: ${(err as Error).message}`]);
      } finally {
        setBusy(false);
      }
    },
    [kitId, importPackage]
  );

  return (
    <div>
      <div
        className={`grid cursor-pointer place-items-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${
          drag ? 'border-brand-500 bg-brand-600/10' : 'border-ink-600 bg-ink-900/50 hover:border-ink-400'
        }`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void handleFiles([...e.dataTransfer.files]);
        }}
      >
        <div>
          <div className="text-3xl">{busy ? '⏳' : '⬆'}</div>
          <div className="mt-2 font-semibold text-white">
            {busy ? 'Importing package…' : 'Drop your brand package'}
          </div>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-ink-500">
            A .zip with <code className="text-accent-400">logos/</code>,{' '}
            <code className="text-accent-400">products/</code>,{' '}
            <code className="text-accent-400">lifestyle/</code> folders (or loose images).
            Optional <code className="text-accent-400">brand.json</code> prefills name, colors,
            voice &amp; keywords. Colors are auto-extracted from your logo otherwise.
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          multiple
          accept=".zip,image/*,.ttf,.otf,.woff,.woff2"
          onChange={(e) => {
            void handleFiles([...(e.target.files ?? [])]);
            e.target.value = '';
          }}
        />
      </div>
      {messages.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-ink-400">
          {messages.map((m, i) => (
            <li key={i}>• {m}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ColorEditor({
  colors,
  onChange,
}: {
  colors: BrandColor[];
  onChange: (colors: BrandColor[]) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {colors.map((c, i) => (
        <div key={i} className="group relative">
          <input
            type="color"
            value={c.hex}
            onChange={(e) =>
              onChange(colors.map((cc, ii) => (ii === i ? { ...cc, hex: e.target.value } : cc)))
            }
            className="h-10 w-10 cursor-pointer rounded-xl border border-ink-600 bg-transparent"
            title={`${c.role} · ${c.hex}`}
          />
          <button
            className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 rounded-full bg-red-900 text-[10px] text-white group-hover:block"
            onClick={() => onChange(colors.filter((_, ii) => ii !== i))}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        className="btn-secondary !px-3 !py-2 text-xs"
        onClick={() => onChange([...colors, { hex: '#8b5cf6', role: 'accent' }])}
      >
        + Color
      </button>
    </div>
  );
}

export default function BrandPage() {
  const {
    kits,
    assets,
    activeKitId,
    loaded,
    refresh,
    setActiveKit,
    createKit,
    updateKit,
    removeKit,
    addAsset,
  } = useBrandStore();

  useEffect(() => {
    if (!loaded) void refresh();
  }, [loaded, refresh]);

  const kit = kits.find((k) => k.id === activeKitId) ?? null;
  const kitAssets = assets.filter((a) => a.kitId === kit?.id);
  const [keywordsText, setKeywordsText] = useState('');

  useEffect(() => {
    setKeywordsText(kit?.keywords.join(', ') ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kit?.id]);

  return (
    <div>
      <PageHeader
        title="Brand Kits"
        subtitle="One kit per brand: identity, palette and assets. Everything downstream — studio prompts and content packs — pulls from here."
        actions={
          <button className="btn-primary" onClick={() => void createKit()}>
            + New kit
          </button>
        }
      />

      {loaded && kits.length === 0 ? (
        <div className="mx-auto max-w-xl">
          <PackageDropzone kitId={null} />
          <div className="mt-6">
            <EmptyState
              icon="⬢"
              title="No brand kits yet"
              body="Drop a brand package above to create your first kit automatically, or start from a blank kit and add assets by hand."
              action={
                <button className="btn-secondary" onClick={() => void createKit()}>
                  Start blank
                </button>
              }
            />
          </div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          {/* Kit list */}
          <div className="space-y-2">
            {kits.map((k) => (
              <button
                key={k.id}
                onClick={() => setActiveKit(k.id)}
                className={`card block w-full p-4 text-left transition ${
                  k.id === activeKitId ? 'border-brand-500/70' : 'hover:border-ink-500'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="flex -space-x-1.5">
                    {(k.colors.length ? k.colors : [{ hex: '#3a3a58', role: 'primary' as const }])
                      .slice(0, 4)
                      .map((c, i) => (
                        <span
                          key={i}
                          className="h-4 w-4 rounded-full border border-ink-900"
                          style={{ backgroundColor: c.hex }}
                        />
                      ))}
                  </div>
                  <span className="truncate font-semibold text-white">{k.name}</span>
                </div>
                <div className="mt-1 text-xs text-ink-500">
                  {assets.filter((a) => a.kitId === k.id).length} assets · {formatAgo(k.updatedAt)}
                </div>
              </button>
            ))}
          </div>

          {/* Editor */}
          {kit ? (
            <div className="space-y-4">
              <div className="card space-y-4 p-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Brand name">
                    <input
                      className="input"
                      value={kit.name}
                      onChange={(e) => void updateKit(kit.id, { name: e.target.value })}
                    />
                  </Field>
                  <Field label="Tagline">
                    <input
                      className="input"
                      placeholder="Fresh from our farm to your table"
                      value={kit.tagline}
                      onChange={(e) => void updateKit(kit.id, { tagline: e.target.value })}
                    />
                  </Field>
                  <Field label="Industry">
                    <input
                      className="input"
                      placeholder="organic farm & grocery"
                      value={kit.industry}
                      onChange={(e) => void updateKit(kit.id, { industry: e.target.value })}
                    />
                  </Field>
                  <Field label="Voice">
                    <select
                      className="input"
                      value={kit.voice}
                      onChange={(e) =>
                        void updateKit(kit.id, { voice: e.target.value as typeof kit.voice })
                      }
                    >
                      {VOICE_OPTIONS.map((v) => (
                        <option key={v.value} value={v.value}>
                          {v.label} — {v.hint}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field
                  label="What does this brand sell / stand for?"
                  hint="Used as the visual subject of generated scenes — be concrete."
                >
                  <textarea
                    className="input min-h-[70px] resize-y"
                    placeholder="Small-batch organic vegetables and flowers grown in the Hudson Valley…"
                    value={kit.description}
                    onChange={(e) => void updateKit(kit.id, { description: e.target.value })}
                  />
                </Field>
                <Field label="Keywords" hint="Comma-separated; folded into every prompt.">
                  <input
                    className="input"
                    placeholder="organic, sun-drenched, hand-picked, rustic"
                    value={keywordsText}
                    onChange={(e) => setKeywordsText(e.target.value)}
                    onBlur={() =>
                      void updateKit(kit.id, {
                        keywords: keywordsText
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </Field>
                <Field label="Palette" hint="Auto-extracted from your logo on import — tweak freely.">
                  <ColorEditor
                    colors={kit.colors}
                    onChange={(colors) => void updateKit(kit.id, { colors })}
                  />
                </Field>
              </div>

              <PackageDropzone kitId={kit.id} />

              {KIND_LABELS.map(({ kind, label, hint }) => {
                const group = kitAssets.filter((a) => a.kind === kind);
                return (
                  <div key={kind} className="card p-5">
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <span className="font-semibold text-white">{label}</span>
                        {hint && <span className="ml-2 text-xs text-ink-500">{hint}</span>}
                      </div>
                      <label className="btn-secondary !px-3 !py-1.5 cursor-pointer text-xs">
                        + Add
                        <input
                          type="file"
                          className="hidden"
                          multiple
                          accept={kind === 'font' ? '.ttf,.otf,.woff,.woff2' : 'image/*'}
                          onChange={(e) => {
                            for (const f of [...(e.target.files ?? [])]) {
                              void addAsset(kit.id, kind, f);
                            }
                            e.target.value = '';
                          }}
                        />
                      </label>
                    </div>
                    {group.length ? (
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                        {group.map((a) => (
                          <AssetThumb key={a.id} asset={a} />
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-ink-600">Nothing here yet.</p>
                    )}
                  </div>
                );
              })}

              <div className="flex items-center justify-between">
                <Link href="/generate/" className="btn-primary">
                  ⚡ Generate content from this brand
                </Link>
                <button
                  className="btn-danger"
                  onClick={() => {
                    if (confirm(`Delete brand kit “${kit.name}” and all its assets?`)) {
                      void removeKit(kit.id);
                    }
                  }}
                >
                  Delete kit
                </button>
              </div>
            </div>
          ) : (
            <EmptyState icon="⬢" title="Select a kit" body="Pick a brand kit on the left to edit it." />
          )}
        </div>
      )}
    </div>
  );
}
