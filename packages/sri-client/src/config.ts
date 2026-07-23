/**
 * Configuracion centralizada del SRI. Modulo exclusivo de servidor: ningun
 * componente visual debe conocer las URLs del servicio.
 */

export type SriEnvironment = 'test' | 'production';
export type SriProviderName = 'mock' | 'soap';

const DEFAULT_TEST_WSDL =
  'https://celcer.sri.gob.ec/comprobantes-electronicos-ws/ConsultaComprobante?wsdl';
const DEFAULT_PRODUCTION_WSDL =
  'https://cel.sri.gob.ec/comprobantes-electronicos-ws/ConsultaComprobante?wsdl';

const readEnv = (key: string, fallback: string): string => {
  const value = process.env[key];
  return value === undefined || value.trim() === '' ? fallback : value.trim();
};

const readInt = (key: string, fallback: number): number => {
  const parsed = Number.parseInt(readEnv(key, String(fallback)), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export interface SriConfig {
  provider: SriProviderName;
  environment: SriEnvironment;
  wsdlUrl: string;
  timeoutMs: number;
  maxRetries: number;
  requestDelayMs: number;
}

export const getSriEnvironment = (): SriEnvironment => {
  const value = readEnv('SRI_ENVIRONMENT', 'test');
  if (value !== 'test' && value !== 'production') {
    throw new Error(`SRI_ENVIRONMENT debe ser "test" o "production" (recibido: "${value}").`);
  }
  return value;
};

export const getSriProviderName = (): SriProviderName => {
  const value = readEnv('SRI_PROVIDER', 'mock');
  if (value !== 'mock' && value !== 'soap') {
    throw new Error(`SRI_PROVIDER debe ser "mock" o "soap" (recibido: "${value}").`);
  }
  return value;
};

export const getSriConfig = (): SriConfig => {
  const environment = getSriEnvironment();
  return {
    provider: getSriProviderName(),
    environment,
    wsdlUrl:
      environment === 'production'
        ? readEnv('SRI_PRODUCTION_WSDL_URL', DEFAULT_PRODUCTION_WSDL)
        : readEnv('SRI_TEST_WSDL_URL', DEFAULT_TEST_WSDL),
    timeoutMs: readInt('SRI_REQUEST_TIMEOUT_MS', 20_000),
    maxRetries: readInt('SRI_MAX_RETRIES', 3),
    requestDelayMs: readInt('SRI_REQUEST_DELAY_MS', 500),
  };
};

/** Etiqueta legible del entorno activo, para mostrar en la interfaz. */
export const describeEnvironment = (environment: SriEnvironment): string =>
  environment === 'production' ? 'Produccion' : 'Pruebas';
