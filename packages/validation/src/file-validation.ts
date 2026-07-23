import { badRequest } from '@validasri/shared';

export interface FileConstraints {
  maxSizeBytes: number;
  maxKeys: number;
}

export interface UploadedFileMeta {
  name: string;
  size: number;
}

const ALLOWED_EXTENSION = '.txt';
const NULL_CHAR = String.fromCharCode(0);
const DEL_CHAR_CODE = 127;
const SPACE_CHAR_CODE = 32;

/** Caracteres de control ASCII (0-31) y DEL: no validos en un nombre de archivo. */
const isControlChar = (char: string): boolean => {
  const code = char.charCodeAt(0);
  return code < SPACE_CHAR_CODE || code === DEL_CHAR_CODE;
};

/**
 * Sanitiza el nombre del archivo antes de guardarlo o mostrarlo: elimina rutas,
 * caracteres de control y caracteres no seguros para cabeceras HTTP.
 */
export const sanitizeFilename = (rawName: string): string => {
  const base = rawName.split(/[/\\]/).pop() ?? '';
  const cleaned = [...base]
    .filter((char) => !isControlChar(char))
    .join('')
    .replace(/[<>:"|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const safe = cleaned.length > 0 ? cleaned : 'archivo.txt';
  return safe.slice(0, 120);
};

export const hasTxtExtension = (filename: string): boolean =>
  filename.toLowerCase().endsWith(ALLOWED_EXTENSION);

/** Valida extension y tamano. Lanza `AppError` con mensaje apto para el usuario. */
export const assertValidTxtFile = (file: UploadedFileMeta, constraints: FileConstraints): void => {
  if (!hasTxtExtension(file.name)) {
    throw badRequest('Solo se aceptan archivos con extension .txt.');
  }
  if (file.size <= 0) {
    throw badRequest('El archivo esta vacio.');
  }
  if (file.size > constraints.maxSizeBytes) {
    const maxMb = (constraints.maxSizeBytes / (1024 * 1024)).toFixed(1);
    throw badRequest(`El archivo supera el tamano maximo permitido de ${maxMb} MB.`);
  }
};

export const assertKeyCountWithinLimit = (keyCount: number, constraints: FileConstraints): void => {
  if (keyCount === 0) {
    throw badRequest('El archivo no contiene ninguna clave de acceso valida.');
  }
  if (keyCount > constraints.maxKeys) {
    throw badRequest(
      `El archivo contiene ${keyCount.toLocaleString('es-EC')} claves validas y el maximo por lote ` +
        `es ${constraints.maxKeys.toLocaleString('es-EC')}. Divide el archivo en varias partes.`,
    );
  }
};

/**
 * Rechaza contenido que no parece un TXT plano (bytes nulos = binario disfrazado).
 */
export const assertPlainTextContent = (content: string): void => {
  if (content.includes(NULL_CHAR)) {
    throw badRequest('El archivo no es un texto plano valido.');
  }
};
