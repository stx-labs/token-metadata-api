import { DbMetadataLocaleBundle } from '../../pg/types';
import { MetadataPropertiesType, MetadataType, MetadataValueType } from '../schemas';

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
  return contracts.map(contract => {
    const colonIndex = contract.lastIndexOf(':');
    if (colonIndex !== -1) {
      return {
        principal: contract.substring(0, colonIndex),
        tokenNumber: Number(contract.substring(colonIndex + 1)),
      };
    }
    return { principal: contract, tokenNumber: 1 };
  });
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
