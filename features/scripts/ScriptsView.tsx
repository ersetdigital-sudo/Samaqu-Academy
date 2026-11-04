'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useData } from '@/components/providers/DataProvider';
import { useModal } from '@/components/providers/ModalProvider';
import { useRole } from '@/components/providers/RoleProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { CaseMarkTag } from '@/components/ui/badges';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { Note } from '@/components/ui/Note';
import { PageHeader } from '@/components/ui/PageHeader';
import { RecordForm } from '@/components/ui/RecordForm';
import { CASE_MARKS, SCRIPT_CATEGORIES } from '@/lib/constants';
import {
  BEFORE_AFTER_FIELDS,
  SCRIPT_FIELDS,
} from '@/lib/form-schemas';
import type { BeforeAfter, CaseMark, CaseStudy, Script } from '@/lib/types';
import { copyToClipboard } from '@/lib/utils/clipboard';
import { newId } from '@/lib/utils/id';
import { BeforeAfterGuidance } from './BeforeAfterGuidance';
import { CaseDetail } from './CaseDetail';
import { CaseForm } from './CaseForm';
import { ScriptDetail } from './ScriptDetail';

type Tab = 'script' | 'case' | 'ba';
type ContentKind = 'script' | 'case' | 'ba';

interface FilterState {
  q: string;
  cat: string;
  mark: CaseMark | 'Semua';
}

const TAB_META: Record<Tab, { label: string; icon: string; add: string; placeholder: string }> = {
  script: {
    label: 'Script',
    icon: 'message-square-text',
    add: 'Tambah Script',
    placeholder: 'Cari judul, respons, tag…',
  },
  case: {
    label: 'Studi Kasus',
    icon: 'briefcase',
    add: 'Tambah Kasus',
    placeholder: 'Cari kasus, pesan, pelajaran…',
  },
  ba: {
    label: 'Before & After',
    icon: 'repeat',
    add: 'Tambah Contoh',
    placeholder: 'Cari situasi, respons…',
  },
};

const COLLECTION_BY_TAB: Record<Tab, ContentKind> = {
  script: 'script',
  case: 'case',
  ba: 'ba',
};

export function ScriptsView() {
  const { snapshot, upsertContent, deleteContent } = useData();
  const { canManage } = useRole();
  const { openModal, closeModal } = useModal();
  const { showToast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  const tabParam = searchParams.get('tab');
  const tab: Tab = tabParam === 'case' || tabParam === 'ba' ? tabParam : 'script';
  const catParam = searchParams.get('cat');
  const openId = searchParams.get('open');
  const [filters, setFilters] = useState<Record<Tab, FilterState>>({
    script: { q: '', cat: 'Semua', mark: 'Semua' },
    case: { q: '', cat: 'Semua', mark: 'Semua' },
    ba: { q: '', cat: 'Semua', mark: 'Semua' },
  });
  const openDetailRef = useRef<(id: string) => boolean>(() => false);
  const openedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!catParam) return;
    setFilters((previous) => ({
      ...previous,
      [tab]: { ...previous[tab], cat: catParam },
    }));
  }, [catParam, tab]);

  const scripts = snapshot.content.scripts;
  const cases = snapshot.content.cases;
  const beforeAfter = snapshot.content.beforeAfter;
  const collection = tab === 'script' ? scripts : tab === 'case' ? cases : beforeAfter;
  const filter = filters[tab];
  const meta = TAB_META[tab];

  const filtered = collection.filter((item) => {
    if (filter.cat !== 'Semua' && item.category !== filter.cat) return false;
    if (tab === 'case' && filter.mark !== 'Semua' && (item as CaseStudy).mark !== filter.mark) {
      return false;
    }
    const search = filter.q.trim().toLowerCase();
    if (!search) return true;
    const haystack = Object.values(item as unknown as Record<string, unknown>)
      .map((value) => (Array.isArray(value) ? value.join(' ') : String(value)))
      .join(' ')
      .toLowerCase();
    return haystack.includes(search);
  });

  const countCategory = (category: string) =>
    category === 'Semua'
      ? collection.length
      : collection.filter((item) => item.category === category).length;

  const setTab = (nextTab: Tab) => {
    router.replace(`/scripts?tab=${nextTab}`, { scroll: false });
  };

  const setFilter = (patch: Partial<FilterState>) => {
    setFilters((previous) => ({
      ...previous,
      [tab]: { ...previous[tab], ...patch },
    }));
  };

  const copy = async (text: string) => {
    const ok = await copyToClipboard(text);
    showToast(ok ? 'Berhasil disalin ke clipboard' : 'Gagal menyalin', ok ? 'ok' : 'err');
  };

  const adminButtons = (onEdit: () => void, onDelete: () => void): ReactNode =>
    canManage ? (
      <>
        <button
          className="btn sm"
          onClick={(event) => {
            event.stopPropagation();
            onEdit();
          }}
        >
          <Icon name="pencil" />
          Edit
        </button>
        <button
          className="btn sm"
          style={{ color: 'var(--red)' }}
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
        >
          <Icon name="trash-2" />
          Hapus
        </button>
      </>
    ) : null;

  const confirmDelete = (kind: ContentKind, title: string, id: string) => {
    const labels: Record<ContentKind, string> = {
      script: 'script',
      case: 'studi kasus',
      ba: 'contoh Before & After',
    };
    openModal(
      <ConfirmDialog
        title={`Hapus ${labels[kind]} ini?`}
        message={`"${title}" akan dihapus. Tindakan ini tidak dapat dibatalkan.`}
        onCancel={closeModal}
        onConfirm={async () => {
          const keyByKind = {
            script: 'scripts',
            case: 'cases',
            ba: 'beforeAfter',
          } as const;
          await deleteContent(keyByKind[kind], id);
          closeModal();
          showToast('Data berhasil dihapus');
        }}
      />,
    );
  };

  const openScriptDetail = (script: Script) => {
    openModal(
      <ScriptDetail
        script={script}
        canManage={canManage}
        onClose={closeModal}
        onEdit={() => openScriptForm(script)}
        onDelete={() => confirmDelete('script', script.title, script.id)}
      />,
      { large: true },
    );
  };

  const openCaseDetail = (caseStudy: CaseStudy) => {
    openModal(
      <CaseDetail
        caseStudy={caseStudy}
        canManage={canManage}
        onClose={closeModal}
        onEdit={() => openCaseForm(caseStudy)}
        onDelete={() => confirmDelete('case', caseStudy.title, caseStudy.id)}
      />,
      { large: true },
    );
  };

  const openScriptForm = (current?: Script) => {
    openModal(
      <RecordForm
        key={current?.id ?? 'new-script'}
        title={current ? 'Edit Script' : 'Tambah Script'}
        subtitle="Kolom bertanda * wajib diisi."
        fields={SCRIPT_FIELDS}
        initial={current ?? {}}
        defaults={{
          category: filter.cat !== 'Semua' ? filter.cat : SCRIPT_CATEGORIES[0],
        }}
        submitLabel={current ? 'Simpan Perubahan' : 'Tambahkan'}
        onSubmit={async (values) => {
          const item: Script = {
            id: current?.id ?? newId('scr'),
            title: String(values.title),
            category: String(values.category),
            situation: String(values.situation),
            response: String(values.response),
            variants: Array.isArray(values.variants) ? values.variants : [],
            notes: String(values.notes),
            tags: Array.isArray(values.tags) ? values.tags : [],
            sample: false,
            updatedAt: Date.now(),
          };
          await upsertContent('scripts', item);
          closeModal();
          showToast(current ? 'Perubahan berhasil disimpan' : 'Script berhasil ditambahkan');
        }}
        onCancel={closeModal}
      />,
      { large: true },
    );
  };

  const openCaseForm = (current?: CaseStudy) => {
    openModal(
      <CaseForm
        current={current}
        defaults={{
          category: filter.cat !== 'Semua' ? filter.cat : SCRIPT_CATEGORIES[0],
          mark: 'Materi Pembelajaran',
        }}
        onCancel={closeModal}
        onSubmit={async (item) => {
          await upsertContent('cases', item);
          closeModal();
          showToast(current ? 'Perubahan berhasil disimpan' : 'Studi kasus berhasil ditambahkan');
        }}
      />,
      { large: true },
    );
  };

  const openBeforeAfterForm = (current?: BeforeAfter) => {
    openModal(
      <RecordForm
        key={current?.id ?? 'new-ba'}
        title={current ? 'Edit Before & After' : 'Tambah Before & After'}
        subtitle="Kolom bertanda * wajib diisi."
        fields={BEFORE_AFTER_FIELDS}
        initial={current ?? {}}
        defaults={{
          category: filter.cat !== 'Semua' ? filter.cat : SCRIPT_CATEGORIES[0],
        }}
        submitLabel={current ? 'Simpan Perubahan' : 'Tambahkan'}
        onSubmit={async (values) => {
          const mark = String(values.mark ?? '');
          const item: BeforeAfter = {
            id: current?.id ?? newId('ba'),
            title: String(values.title),
            category: String(values.category),
            mark: mark ? (mark as CaseMark) : undefined,
            before: String(values.before),
            after: String(values.after),
            why: String(values.why),
            notes: String(values.notes),
            mistakeToAvoid: String(values.mistakeToAvoid ?? '').trim() || undefined,
            principles: Array.isArray(values.principles) ? values.principles.map(String) : [],
            sample: false,
            updatedAt: Date.now(),
          };
          await upsertContent('beforeAfter', item);
          closeModal();
          showToast(current ? 'Perubahan berhasil disimpan' : 'Contoh berhasil ditambahkan');
        }}
        onCancel={closeModal}
      />,
      { large: true },
    );
  };

  const openCreateForm = () => {
    if (tab === 'script') openScriptForm();
    else if (tab === 'case') openCaseForm();
    else openBeforeAfterForm();
  };

  openDetailRef.current = (id: string) => {
    if (tab === 'script') {
      const script = scripts.find((item) => item.id === id);
      if (!script) return false;
      openScriptDetail(script);
      return true;
    }
    if (tab === 'case') {
      const caseStudy = cases.find((item) => item.id === id);
      if (!caseStudy) return false;
      openCaseDetail(caseStudy);
      return true;
    }
    const item = beforeAfter.find((entry) => entry.id === id);
    if (!item) return false;
    openBeforeAfterForm(item);
    return true;
  };

  useEffect(() => {
    if (!openId || openedRef.current === openId) return;
    if (openDetailRef.current(openId)) openedRef.current = openId;
  }, [openId, scripts, cases, beforeAfter]);

  return (
    <>
      <PageHeader
        eyebrow="Learning & Service"
        title="Script Library"
        subtitle="Panduan percakapan, studi kasus nyata, dan contoh perbaikan respons. Gunakan sebagai acuan, bukan kalimat wajib."
        actions={
          canManage ? (
            <button className="btn p" onClick={openCreateForm}>
              <Icon name="plus" />
              {meta.add}
            </button>
          ) : null
        }
      />

      <div className="row sp wrap" style={{ marginBottom: 16 }}>
        <div className="seg" aria-label="Jenis konten">
          {(Object.keys(TAB_META) as Tab[]).map((item) => (
            <button
              key={item}
              className={tab === item ? 'on' : ''}
              onClick={() => setTab(item)}
            >
              <Icon name={TAB_META[item].icon} />
              {TAB_META[item].label}{' '}
              <span className="n">
                {item === 'script' ? scripts.length : item === 'case' ? cases.length : beforeAfter.length}
              </span>
            </button>
          ))}
        </div>
        <div className="search" style={{ maxWidth: 340 }}>
          <Icon name="search" />
          <input
            className="inp"
            placeholder={meta.placeholder}
            value={filter.q}
            onChange={(event) => setFilter({ q: event.target.value })}
            aria-label="Cari konten"
          />
        </div>
      </div>

      <div style={{ marginBottom: 18 }}>
        {tab === 'case' ? (
          <Note variant="green" icon="lightbulb">
            <b>Pahami situasinya, bukan hafalkan jawabannya.</b> Studi kasus membantu mengenali pola
            masalah dan cara berpikir saat melayani customer.
          </Note>
        ) : (
          <Note variant="neutral">
            <b>Script adalah panduan, bukan kalimat wajib.</b> Sesuaikan dengan konteks percakapan,
            nama, dan kebutuhan customer supaya tetap natural.
          </Note>
        )}
      </div>

      <div className="lib">
        <div className="rail">
          <div className="rt">Kategori</div>
          {['Semua', ...SCRIPT_CATEGORIES].map((category) => (
            <button
              key={category}
              className={filter.cat === category ? 'on' : ''}
              onClick={() => setFilter({ cat: category })}
            >
              <span>{category === 'Semua' ? 'Semua kategori' : category}</span>
              <span className="n">{countCategory(category)}</span>
            </button>
          ))}
        </div>

        <div style={{ minWidth: 0 }}>
          <div className="rail-sel" style={{ marginBottom: 12 }}>
            <select
              className="inp"
              value={filter.cat}
              onChange={(event) => setFilter({ cat: event.target.value })}
              aria-label="Filter kategori"
            >
              {['Semua', ...SCRIPT_CATEGORIES].map((category) => (
                <option key={category} value={category}>
                  {category === 'Semua' ? 'Semua kategori' : category} ({countCategory(category)})
                </option>
              ))}
            </select>
          </div>

          {tab === 'case' ? (
            <div className="seg" style={{ marginBottom: 14 }}>
              {(['Semua', ...CASE_MARKS] as (CaseMark | 'Semua')[]).map((mark) => (
                <button
                  key={mark}
                  className={filter.mark === mark ? 'on' : ''}
                  onClick={() => setFilter({ mark })}
                >
                  {mark === 'Semua' ? 'Semua tanda' : mark}{' '}
                  <span className="n">
                    {mark === 'Semua'
                      ? cases.length
                      : cases.filter((item) => item.mark === mark).length}
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          {tab === 'ba' ? (
            <div>
              {filtered.length ? (
                filtered.map((item) => {
                  const ba = item as BeforeAfter;
                  return (
                    <div className="card" style={{ marginBottom: 14 }} key={ba.id}>
                      <div
                        className="row sp wrap"
                        style={{ alignItems: 'flex-start' }}
                      >
                        <div>
                          <h3 style={{ fontSize: 15.5 }}>{ba.title}</h3>
                          <div className="row mt1" style={{ gap: 6 }}>
                            <span className="tag gr">{ba.category}</span>
                            {ba.mark ? <CaseMarkTag mark={ba.mark} /> : null}
                            {ba.sample ? <span className="tag">Contoh</span> : null}
                          </div>
                        </div>
                        <div className="row wrap">
                          <button className="btn sm" onClick={() => copy(ba.after)}>
                            <Icon name="copy" />
                            Copy After
                          </button>
                          {adminButtons(
                            () => openBeforeAfterForm(ba),
                            () => confirmDelete('ba', ba.title, ba.id),
                          )}
                        </div>
                      </div>
                      <BeforeAfterGuidance item={ba} />
                      <div className="dd mt">
                        <div className="dont">
                          <div className="lbl">Before</div>
                          <p className="ba-text">{ba.before}</p>
                        </div>
                        <div className="do">
                          <div className="lbl">After</div>
                          <p className="ba-text">{ba.after}</p>
                        </div>
                      </div>
                      <div className="grid g2 mt" style={{ gap: 12 }}>
                        <div className="sm">
                          <div className="xs muted" style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                            Kenapa lebih baik
                          </div>
                          {ba.why}
                        </div>
                        {ba.notes ? (
                          <div className="sm">
                            <div className="xs muted" style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                              Catatan untuk admin
                            </div>
                            {ba.notes}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              ) : (
                <EmptyState
                  icon={filter.q ? 'search-x' : 'inbox'}
                  title={filter.q ? 'Tidak ada hasil' : 'Belum ada data'}
                  subtitle={
                    filter.q
                      ? 'Coba kata kunci lain atau ubah filter.'
                      : 'Belum ada contoh Before & After di kategori ini.'
                  }
                  action={
                    canManage ? (
                      <button className="btn sm" onClick={() => openBeforeAfterForm()}>
                        <Icon name="plus" />
                        Tambah
                      </button>
                    ) : null
                  }
                />
              )}
            </div>
          ) : (
            <div className={filtered.length ? 'grid g2' : ''}>
              {filtered.length ? (
                filtered.map((item) =>
                  tab === 'script' ? (
                    (() => {
                      const script = item as Script;
                      return (
                        <div
                          className="card ck"
                          style={{ display: 'flex', flexDirection: 'column' }}
                          role="link"
                          tabIndex={0}
                          key={script.id}
                          onClick={() => openScriptDetail(script)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              openScriptDetail(script);
                            }
                          }}
                        >
                          <div className="row sp">
                            <span className="tag gr">{script.category}</span>
                            {script.sample ? <span className="tag">Contoh</span> : null}
                          </div>
                          <h3 className="mt">{script.title}</h3>
                          {script.situation ? (
                            <p className="sm muted mt1 clamp-2">{script.situation}</p>
                          ) : null}
                          <div className="after sm mt1" style={{ flex: 1 }}>
                            <div className="clamp-3">{script.response}</div>
                          </div>
                          {script.tags.length ? (
                            <div className="chips mt1">
                              {script.tags.map((tag) => (
                                <span className="tag" style={{ fontSize: 11 }} key={tag}>
                                  #{tag}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          <div className="row mt wrap">
                            <button
                              className="btn sm"
                              onClick={(event) => {
                                event.stopPropagation();
                                copy(script.response);
                              }}
                            >
                              <Icon name="copy" />
                              Copy
                            </button>
                            {adminButtons(
                              () => openScriptForm(script),
                              () => confirmDelete('script', script.title, script.id),
                            )}
                          </div>
                        </div>
                      );
                    })()
                  ) : (
                    (() => {
                      const caseStudy = item as CaseStudy;
                      return (
                        <div
                          className="card ck"
                          style={{ display: 'flex', flexDirection: 'column' }}
                          role="link"
                          tabIndex={0}
                          key={caseStudy.id}
                          onClick={() => openCaseDetail(caseStudy)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              openCaseDetail(caseStudy);
                            }
                          }}
                        >
                          <div
                            className="row sp"
                            style={{ gap: 6, flexWrap: 'wrap' }}
                          >
                            <span className="tag">{caseStudy.category}</span>
                            <CaseMarkTag mark={caseStudy.mark} />
                          </div>
                          <h3 className="mt">{caseStudy.title}</h3>
                          <p className="sm muted mt1 clamp-2">{caseStudy.situation}</p>
                          <div
                            className="note gn mt1 sm"
                            style={{ flex: 1, padding: '10px 12px' }}
                          >
                            <Icon name="lightbulb" />
                            <div className="clamp-3">{caseStudy.lesson}</div>
                          </div>
                          <div className="row mt wrap">
                            <button
                              className="btn sm"
                              onClick={(event) => {
                                event.stopPropagation();
                                openCaseDetail(caseStudy);
                              }}
                            >
                              <Icon name="book-open" />
                              Pelajari
                            </button>
                            {adminButtons(
                              () => openCaseForm(caseStudy),
                              () => confirmDelete('case', caseStudy.title, caseStudy.id),
                            )}
                          </div>
                        </div>
                      );
                    })()
                  ),
                )
              ) : (
                <EmptyState
                  icon={filter.q ? 'search-x' : 'inbox'}
                  title={filter.q ? 'Tidak ada hasil' : 'Belum ada data'}
                  subtitle={
                    filter.q
                      ? 'Coba kata kunci lain atau ubah filter.'
                      : `Belum ada ${meta.label.toLowerCase()} di kategori ini.`
                  }
                  action={
                    canManage ? (
                      <button className="btn sm" onClick={openCreateForm}>
                        <Icon name="plus" />
                        Tambah
                      </button>
                    ) : null
                  }
                />
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
