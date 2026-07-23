import { getSriConfig } from './config';
import { MockSriProvider } from './mock-provider';
import { SoapSriProvider } from './soap-provider';
import type { SriProvider } from './types';

export * from './config';
export * from './errors';
export * from './normalizer';
export * from './types';
export { MockSriProvider } from './mock-provider';
export { SoapSriProvider } from './soap-provider';

/**
 * Punto unico de creacion del cliente del SRI. Cambiar entre el servicio real y
 * el proveedor simulado es solo `SRI_PROVIDER`.
 */
export const createSriProvider = (): SriProvider => {
  const config = getSriConfig();
  if (config.provider === 'mock') {
    return new MockSriProvider();
  }
  return new SoapSriProvider({ wsdlUrl: config.wsdlUrl, timeoutMs: config.timeoutMs });
};
