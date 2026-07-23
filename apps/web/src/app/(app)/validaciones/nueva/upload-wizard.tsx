'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  FileText,
  Loader2,
  Upload,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { parseAccessKeysTxt, type ParsedTxt } from '@validasri/validation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface UploadWizardProps {
  maxSizeMb: number;
  maxKeys: number;
}

interface FileAnalysis {
  filename: string;
  content: string;
  parsed: ParsedTxt;
}

export function UploadWizard({ maxSizeMb, maxKeys }: UploadWizardProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [analysis, setAnalysis] = useState<FileAnalysis | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith('.txt')) {
        toast.error('Solo se aceptan archivos con extension .txt.');
        return;
      }
      if (file.size > maxSizeMb * 1024 * 1024) {
        toast.error(`El archivo supera el tamano maximo de ${maxSizeMb} MB.`);
        return;
      }
      const content = await file.text();
      const parsed = parseAccessKeysTxt(content);
      if (parsed.totalValid === 0) {
        toast.error('El archivo no contiene ninguna clave de acceso valida.');
        return;
      }
      if (parsed.totalValid > maxKeys) {
        toast.error(
          `El archivo tiene ${parsed.totalValid.toLocaleString('es-EC')} claves validas y el maximo por lote es ${maxKeys.toLocaleString('es-EC')}.`,
        );
        return;
      }
      setAnalysis({ filename: file.name, content, parsed });
    },
    [maxKeys, maxSizeMb],
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setDragging(false);
      const file = event.dataTransfer.files[0];
      if (file) void handleFile(file);
    },
    [handleFile],
  );

  const startValidation = async () => {
    if (!analysis) return;
    setSubmitting(true);
    try {
      const formData = new FormData();
      const blob = new Blob([analysis.content], { type: 'text/plain' });
      formData.append('file', blob, analysis.filename);

      const response = await fetch('/validaciones/nueva/api-create', {
        method: 'POST',
        body: formData,
      });
      const data = (await response.json()) as { batchId?: string; error?: string };
      if (!response.ok || !data.batchId) {
        throw new Error(data.error ?? 'No se pudo crear el lote.');
      }
      toast.success('Lote creado. El procesamiento comenzara en breve.');
      router.push(`/lotes/${data.batchId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ocurrio un error inesperado.');
      setSubmitting(false);
      setConfirmOpen(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <Card>
          <CardContent className="p-6">
            <div
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click();
              }}
              onClick={() => inputRef.current?.click()}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              aria-label="Zona para arrastrar o seleccionar el archivo TXT"
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-[var(--radius)] border-2 border-dashed px-6 py-12 text-center transition-colors',
                dragging
                  ? 'border-[var(--color-brand-600)] bg-[var(--color-brand-50)]'
                  : 'border-[var(--color-border)] hover:border-[var(--color-brand-600)]',
              )}
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-brand-50)] text-[var(--color-brand-700)]">
                <Upload className="h-7 w-7" />
              </span>
              <div>
                <p className="font-medium text-slate-900">
                  Arrastra tu archivo aqui o haz clic para seleccionarlo
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Formato .txt · Maximo {maxSizeMb} MB · Hasta{' '}
                  {maxKeys.toLocaleString('es-EC')} claves
                </p>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept=".txt,text/plain"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleFile(file);
                  event.target.value = '';
                }}
              />
            </div>

            {analysis && (
              <div className="mt-6">
                <div className="mb-4 flex items-center gap-2 text-sm text-slate-600">
                  <FileText className="h-4 w-4 text-slate-400" />
                  <span className="font-medium text-slate-800">{analysis.filename}</span>
                  <span className="text-slate-400">
                    · {analysis.parsed.totalLines.toLocaleString('es-EC')} lineas
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <SummaryTile
                    tone="success"
                    icon={<CheckCircle2 className="h-5 w-5" />}
                    label="Validas"
                    value={analysis.parsed.totalValid}
                  />
                  <SummaryTile
                    tone="danger"
                    icon={<XCircle className="h-5 w-5" />}
                    label="Invalidas"
                    value={analysis.parsed.totalInvalid}
                  />
                  <SummaryTile
                    tone="warning"
                    icon={<AlertTriangle className="h-5 w-5" />}
                    label="Duplicadas"
                    value={analysis.parsed.totalDuplicates}
                  />
                </div>

                {analysis.parsed.invalid.length > 0 && (
                  <details className="mt-4 rounded-md border border-[var(--color-border)] bg-slate-50 p-3 text-sm">
                    <summary className="cursor-pointer font-medium text-slate-700">
                      Ver claves invalidas ({analysis.parsed.invalid.length})
                    </summary>
                    <ul className="mt-2 flex flex-col gap-1 text-slate-500">
                      {analysis.parsed.invalid.slice(0, 20).map((invalid) => (
                        <li key={invalid.line}>
                          Linea {invalid.line}: {invalid.message}
                        </li>
                      ))}
                      {analysis.parsed.invalid.length > 20 && (
                        <li className="text-slate-400">
                          … y {analysis.parsed.invalid.length - 20} mas
                        </li>
                      )}
                    </ul>
                  </details>
                )}

                <div className="mt-6 flex flex-wrap gap-3">
                  <Button onClick={() => setConfirmOpen(true)} disabled={analysis.parsed.totalValid === 0}>
                    Iniciar validacion
                  </Button>
                  <Button variant="outline" onClick={() => setAnalysis(null)}>
                    Elegir otro archivo
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div>
        <Card>
          <CardHeader>
            <CardTitle>Formato esperado</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm text-slate-600">
            <p>Una clave de acceso de 49 digitos por linea:</p>
            <pre className="overflow-x-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">
              2207202601099123456700110010010000001231234567811{'\n'}
              2207202601099123456700110010010000001241234567812
            </pre>
            <ul className="flex list-inside list-disc flex-col gap-1 text-slate-500">
              <li>Se ignoran las lineas vacias.</li>
              <li>Se eliminan los espacios sobrantes.</li>
              <li>Las claves repetidas se marcan como duplicadas.</li>
              <li>Cada clave debe tener 49 digitos numericos.</li>
            </ul>
            <p className="flex items-center gap-1.5 text-xs text-slate-400">
              <Copy className="h-3.5 w-3.5" />
              El archivo original no se almacena; solo las claves normalizadas.
            </p>
          </CardContent>
        </Card>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar validacion</DialogTitle>
            <DialogDescription>
              Se creara un lote con {analysis?.parsed.totalValid.toLocaleString('es-EC')} claves
              validas. Este consumo se descontara de tu limite mensual.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="outline" disabled={submitting}>
                Cancelar
              </Button>
            </DialogClose>
            <Button onClick={startValidation} disabled={submitting}>
              {submitting && <Loader2 className="animate-spin" />}
              Confirmar y crear lote
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryTile({
  tone,
  icon,
  label,
  value,
}: {
  tone: 'success' | 'danger' | 'warning';
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  const toneClasses = {
    success: 'bg-[var(--color-success-bg)] text-[var(--color-success)]',
    danger: 'bg-[var(--color-danger-bg)] text-[var(--color-danger)]',
    warning: 'bg-[var(--color-warning-bg)] text-[var(--color-warning)]',
  }[tone];

  return (
    <div className="flex items-center gap-3 rounded-md border border-[var(--color-border)] bg-white p-3">
      <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg', toneClasses)}>
        {icon}
      </span>
      <div>
        <p className="text-xl font-bold text-slate-900">{value.toLocaleString('es-EC')}</p>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
    </div>
  );
}
