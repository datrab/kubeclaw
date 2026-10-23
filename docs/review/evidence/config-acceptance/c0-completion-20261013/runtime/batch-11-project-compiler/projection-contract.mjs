// C0 target-only policy section projection; actual parent resolver/schema/history/grants/task/source/native/owner admission needed first.
export function projectCompilerExecution(author,moduleHasReview) {
 if(author.schemaVersion!=='project-compiler-policy-author.v1')throw Error('CONFIG_COMPILER_POLICY_VERSION');
 const p=author.projectCompiler;
 if(Object.hasOwn(p,'maxConcurrency')||Object.hasOwn(p.execution,'maxAttempts')||Object.hasOwn(p.execution,'maxRemediationCycles'))throw Error('CONFIG_OLD_AUTHOR:/derived');
 if(!p.reviewRepair||p.reviewRepair.mode!==(moduleHasReview?'enabled':'disabled'))throw Error('CONFIG_COMPILER_REVIEW_BRANCH_MISMATCH');
 if(!moduleHasReview&&Object.keys(p.reviewRepair).some(k=>k!=='mode'))throw Error('CONFIG_UNUSED_POLICY:/reviewRepair');
 if(Object.hasOwn(p.repairBudget.categories,'review'))throw Error('CONFIG_OLD_AUTHOR:/review');
 const categories={...p.repairBudget.categories,...(moduleHasReview?{review:p.reviewRepair.maximumOrders}:{})};
 const maximumOrders=Object.values(categories).reduce((n,x)=>n+x,0)+p.repairBudget.maximumOrchestratorOrders;
 return Object.freeze({maxAttempts:1+maximumOrders+p.execution.maxTechnicalRetries,maxRemediationCycles:maximumOrders,maxTechnicalRetries:p.execution.maxTechnicalRetries,timeoutMs:p.execution.timeoutMs,repairBudget:{categories,maximumOrchestratorOrders:p.repairBudget.maximumOrchestratorOrders}});
}
export function assertCompiledPublicationCompatibility(definition) {
 if(definition.maxConcurrency!==1)throw Error('CONFIG_PROJECT_PUBLICATION_COMPATIBILITY');
 // Only scalar compatibility here; actual module graph/source/publication/owner closure needs real resolver.
 return 'compiled current-compatible scalar1';
}
