import { z } from 'zod';
import { ACCESS_KEY_LENGTH, BATCH_STATUSES, ITEM_STATUSES } from '@validasri/shared';

export const accessKeySchema = z
  .string()
  .trim()
  .length(ACCESS_KEY_LENGTH, `La clave de acceso debe tener ${ACCESS_KEY_LENGTH} caracteres.`)
  .regex(/^\d+$/, 'La clave de acceso solo puede contener numeros.');

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Ingresa tu correo electronico.')
    .email('Ingresa un correo electronico valido.')
    .max(255),
  password: z.string().min(8, 'La contrasena debe tener al menos 8 caracteres.').max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const passwordRecoverySchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Ingresa tu correo electronico.')
    .email('Ingresa un correo electronico valido.')
    .max(255),
});
export type PasswordRecoveryInput = z.infer<typeof passwordRecoverySchema>;

export const createBatchSchema = z.object({
  filename: z.string().trim().min(1, 'Falta el nombre del archivo.').max(255),
  content: z.string().min(1, 'El archivo esta vacio.'),
});
export type CreateBatchInput = z.infer<typeof createBatchSchema>;

const positiveInt = z.coerce.number().int().positive();

export const itemsQuerySchema = z.object({
  page: positiveInt.default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  search: z.string().trim().max(60).optional(),
  status: z.enum(ITEM_STATUSES).optional(),
  documentType: z
    .string()
    .trim()
    .regex(/^\d{2}$/, 'Tipo de comprobante invalido.')
    .optional(),
  sortBy: z
    .enum(['access_key', 'status', 'issuer_ruc', 'authorization_date', 'processed_at', 'created_at'])
    .default('created_at'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
});
export type ItemsQuery = z.infer<typeof itemsQuerySchema>;

export const batchesQuerySchema = z.object({
  page: positiveInt.default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().max(255).optional(),
  status: z.enum(BATCH_STATUSES).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type BatchesQuery = z.infer<typeof batchesQuerySchema>;

export const exportQuerySchema = itemsQuerySchema
  .omit({ page: true, pageSize: true })
  .extend({ format: z.enum(['xlsx', 'csv']).default('xlsx') });
export type ExportQuery = z.infer<typeof exportQuerySchema>;

export const organizationSettingsSchema = z.object({
  name: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres.').max(120),
  ruc: z
    .string()
    .trim()
    .regex(/^\d{13}$/, 'El RUC debe tener 13 digitos.')
    .optional()
    .or(z.literal('')),
});
export type OrganizationSettingsInput = z.infer<typeof organizationSettingsSchema>;
