import { DbMetadataLocaleBundle } from '../../pg/types';
import {
  MetadataPropertiesType,
  MetadataType,
  MetadataValueType,
  SmartContractRegEx,
} from '../schemas';

export const isDevEnv = process.env.NODE_ENV === 'development';
export const isTestEnv = process.env.NODE_ENV === 'test';
export const isProdEnv =
  process.env.NODE_ENV === 'production' ||
  process.env.NODE_ENV === 'prod' ||
  !process.env.NODE_ENV ||
  (!isTestEnv && !isDevEnv);

export function parseContractIdentifiers(
  contracts: string[]
): { principal: string; tokenNumber: number }[] {
  const results: { principal: string; tokenNumber: number }[] = [];
  for (const contract of contracts) {
    const colonIndex = contract.lastIndexOf(':');
    let principal: string;
    let tokenNumber = 1;
    if (colonIndex !== -1) {
      principal = contract.substring(0, colonIndex);
      const numStr = contract.substring(colonIndex + 1);
      const parsed = Number(numStr);
      if (!Number.isInteger(parsed) || parsed < 1) continue;
      tokenNumber = parsed;
    } else {
      principal = contract;
    }
    if (!SmartContractRegEx.test(principal)) continue;
    results.push({ principal, tokenNumber });
  }
  return results;
}

export function parseMetadataLocaleBundle(
  locale?: DbMetadataLocaleBundle
): MetadataType | undefined {
  let response: MetadataType | undefined;
  if (locale && locale.metadata) {
    response = {
      sip: locale.metadata.sip,
      name: locale.metadata.name,
      description: locale.metadata.description,
      image: locale.metadata.image,
      cached_image: locale.metadata.cached_image,
      cached_thumbnail_image: locale.metadata.cached_thumbnail_image,
    };
    if (locale.attributes.length > 0) {
      response.attributes = locale.attributes.map(item => ({
        trait_type: item.trait_type,
        value: item.value as MetadataValueType,
        display_type: item.display_type,
      }));
    }
    if (locale.properties.length > 0) {
      const mergedProperties: MetadataPropertiesType = {};
      for (const property of locale.properties) {
        mergedProperties[property.name] = property.value as MetadataValueType;
      }
      response.properties = mergedProperties;
    }
  }
  return response;
}
