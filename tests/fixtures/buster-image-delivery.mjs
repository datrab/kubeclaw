// Public rendering/transport identifiers only; never installed-image or native proof.
import {busterChartProjection} from '../../scripts/generate-buster-chart-config.mjs';
export function fixtureBusterImageDelivery(revision,authorRoot){
 const topology=busterChartProjection(authorRoot);
 return {schemaVersion:'buster-image-delivery.v1',revision,...topology.deployment,expected:{schemaVersion:'pipeline-expected-delivery.v1',role:'buster',serviceInstanceId:`${topology.deployment.namespace}/${topology.deployment.releaseName}/buster-v2-runtime`,callerId:'buster-preparation',generationDigest:topology.generationDigest,selectionDigest:'sha256:'+'a'.repeat(64),packageReceiptDigest:'sha256:'+'b'.repeat(64),imageReceiptDigest:'sha256:'+'c'.repeat(64)}};
}
