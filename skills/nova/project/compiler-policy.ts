import fs from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import {resolveCompilerExecutionGroups} from './execution-group-policy.ts';

const schema=JSON.parse(fs.readFileSync(new URL('./compiler-policy.schema.json',import.meta.url),'utf8')) as object;
interface Validator {(value:unknown):boolean}
const Constructor=Ajv2020 as unknown as new(options:object)=>{compile(schema:object):Validator};
const validate=new Constructor({strict:true,allErrors:true}).compile(schema);

/** Receives the complete selected settings.projectCompiler value. The schema
 * is an exact copy of the approved original policy schema; its author wrapper
 * is used ONLY for validation, not emitted as a new transport/receipt.
 * Numeric/branch receiving is NOT source/selected-owner/task/R/caller authority.
 * Current compileProject and archived compiler paths do not call this entry.
 */
export function resolveProjectCompilerPolicy(value:unknown,moduleHasReview:boolean) {
  if(typeof moduleHasReview!=='boolean')throw new Error('PROJECT_COMPILER_REVIEW_BRANCH_REQUIRED');
  // Own the snapshot before resolving derived values; do not freeze raw authors.
  const policy=structuredClone(value) as any;
  if(!validate({schemaVersion:'project-compiler-policy-author.v1',projectCompiler:policy})) {
    throw new Error('PROJECT_COMPILER_POLICY_INVALID');
  }
  if(policy.reviewRepair.mode!==(moduleHasReview?'enabled':'disabled')) {
    throw new Error('PROJECT_COMPILER_REVIEW_BRANCH_MISMATCH');
  }
  const categories=Object.freeze({lint:policy.repairBudget.categories.lint as number,
    ...(moduleHasReview?{review:policy.reviewRepair.maximumOrders as number}:{}),
    test:policy.repairBudget.categories.test as number});
  const maximumOrders=Object.values(categories).reduce((sum,limit)=>sum+limit,0)
    +policy.repairBudget.maximumOrchestratorOrders;
  const attempts=1+maximumOrders+policy.execution.maxTechnicalRetries;
  if(!Number.isSafeInteger(maximumOrders)||!Number.isSafeInteger(attempts))throw new Error('PROJECT_COMPILER_DERIVED_LIMIT_INVALID');
  const repairBudget=Object.freeze({categories,maximumOrchestratorOrders:policy.repairBudget.maximumOrchestratorOrders as number});
  const moduleExecution=Object.freeze({maxAttempts:attempts,maxRemediationCycles:maximumOrders,
    maxTechnicalRetries:policy.execution.maxTechnicalRetries as number,timeoutMs:policy.execution.timeoutMs as number,repairBudget});
  return Object.freeze({moduleExecution,executionGroups:resolveCompilerExecutionGroups(policy.executionGroups),
    originalAuthorizationVerified:false as const,activationAllowed:false as const});
}
