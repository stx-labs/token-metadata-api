import Fastify from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Api } from '../src/api/init';
import FastifySwagger from '@fastify/swagger';
import { writeFileSync } from 'fs';
import { OpenApiSchemaOptions } from '../src/api/schemas';

/**
 * Generates `openapi.yaml` based on current Swagger definitions.
 */
async function generateOpenApiFiles() {
  const fastify = Fastify({
    trustProxy: true,
    logger: true,
  }).withTypeProvider<TypeBoxTypeProvider>();

  await fastify.register(FastifySwagger, OpenApiSchemaOptions);
  await fastify.register(Api, { prefix: '/metadata/v1' });
  await fastify.ready();

  writeFileSync('./openapi.yaml', fastify.swagger({ yaml: true }));
  await fastify.close();
}

void generateOpenApiFiles();
