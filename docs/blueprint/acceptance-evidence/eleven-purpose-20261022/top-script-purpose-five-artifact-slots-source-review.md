# Five finite Source-only purpose candidates

**All5eligible** under exact existingseal,not globalNON_API. No productexecution/dataacquisition needed for these purpose distinctions;no codewrites made.

## scripts/recover-openclaw-audit-input.mjs:70

Exact reviewed sanitized JSONL archive bytes into exclusive recovery temporary descriptor,then guardedrename to fixed config-audit raw archive; not API submission or successful doctor migration.

Constructor/receiver: Sanitized bytes from fixed sibling archive,strictUTF8+nonemptyJSONobjectlines. Destination .recovering file openedwx0600;write(fd,bytes),owner/fsync,secondoriginal/sanitizedhash+inode check,rename to logs/config-audit.jsonl.migrated.raw;subsequentdoctor owns import/checkpoint.

Guards: Two caller-supplied64hex expectedhashes;canonical physical state/logs/state dirs;raw/sanitizedregularnlink1;fullscrubwhitespace raw;no existing doctorjournal or checkpoint;backup exclusive or identical expectedhash,then selectedrawinode/hash recheck before rename. No livewriters asserted by Source;operator must stopthem.

Limits: No observation of apply,recovery,doctor sanitize/import,productiondata or external pinnedimage. Sanitizedobjects may containAPIlooking fields;canonicalUNKNOWN remains. No need externaldoctor module to establish this local archivewriter purpose.

## scripts/updates/materialize-release.mjs:50

Selected finite runtime/ops Helm-values projection to releases/values/<role>.yaml,consumed as selected Helm-f values; preserves authored values,not a Kubernetes resource stream or successful rendereddeployment.

Constructor/receiver: Runtime rolesnova,buster,prism-agent,prism startfrom actual rolevalues;ops starts{};fixed digest-pinned image refs/codeBundle projection then yaml.dump. Receiver deployment-release.selectedRelease runs originalmaterialize--check;render path supplies correspondingselectedfile to Helm-f and validatesrenderedrelease.

Guards: Families finite;release schemaVersion1/full40hex;selectedCode validates codebundle and imageinputdigest relationship;normalmodeverifyReleaseConfiguration compares entireconfigurationfileset/currentbytes against selectedcommit. --check-selected-source requires--check and reads exactselectedGitvalues,not currentconfigsuccess. --check comparesbytes;defaultwrite writesselectedfivefileroster. mkdir occurs evencheck.

Limits: Not every retainedauthoredkey semanticallyvalidated here;unknown/YAML/APIlookingfields can persist. No successfulreceipt/config/materialization/Helmrender/admission/deploy observation. Deploymentstdout195 remainsblocked. Must retain exactSource/receiver/callerseal,not genericYAMLnonAPI.

## scripts/updates/refresh-versions.mjs:140

Raw upstreamverification progress status with arbitrary version text before validation; not an API output classification or permission to run requests.

Constructor/receiver: Console status interpolates tool/version/arch in changedversionloop,then calls releaseArtifact/verified. Consoleconsumer is trustedupdaterworkflow/test log,notkubectl/Helmresourceinput.

Guards: Exact pinnedsource+trustedcopycaller+statusdescriptor;no content-level restriction claimed. Tool/archfinite but versionarbitraryincludingLF before upstreamvalidator. NativecanonicalroleUNKNOWN must remain.

Limits: No claim outputcannotcontainAPIlookingdocuments;no networkrequest/artifactvalidation/updaterexecution success. No unseenruntimeinputconstraint invented.

## scripts/updates/refresh-versions.mjs:151

Parsed/source-preserving versions.json staging write before downstream versionOutputs/lock validation; selectedconfigartifact,not an API payload or fullyvalidated update.

Constructor/receiver: next=JSON.parse(originalversions);earlierselectedmetadata fields mutated by realfetch/check branches;JSON.stringify(next) writes fixedcwdversions.json;then syncVersions(root,false),syncCodexLock and updateRuntimeToolLocks consume. versions.versionOutputs validates usedfields and constructs mixedmemberMap separately.

Guards: Trustedread-onlymodulecopyfrom workflow;fixedcwdversionsfile;GitHEADversionscomparison controlschangedbranches. JSONparsed but rootextra keys may persist. Full version validation is downstreamAFTERthiswrite. Networkbranches may happenbeforetry. Exact Sourcepurposecannot granttheir execution.

Limits: Not fullyvalidatedschema or allfieldAPI-free;not successfulnetwork/lock/build/currentversionsobserved. versions181 mixedMap/APIgeneration remainsblocked and separateowner. Privatepurpose must not waive its adapters.

## scripts/updates/refresh-versions.mjs:155

Catch-path exact original pre-run versions.json bytes restored to same fixed file; not atomic rollback of generated files,network effects or lock changes.

Constructor/receiver: original captured rawutf8beforemutation;catchfs.writeFileSync(file,original),then rethrows originalerror. Samecwdversionsreceiver.

Guards: Exactsource/filebinding and unmodifiedoriginalvariable;catch only covers151+sync calls,not all earliernetworkbranches. No guarantee generatedoutputs/lockfiles restored.

Limits: OriginalbytesmaycontainAPIlookingextra fields;no globalnonAPI,rollbacksuccess,all-or-nothingupdater or productionexecution observation.

## Shared conditions

CanonicalUNKNOWN staysUNKNOWN;preserve24slots/68physicalpins,caller/loader/native-role checks,privateWeakSetreceipts,beforecache validation andruntime/APIfalseflags. Renewonlyactuallychangedhelperclosurefacts/selectors coherently afterimplementation. Rawstatus andpreservedconfig/archivebytes can containAPIlookingtext;this ispurpose metadata,not contentnonAPIproof. Refresh151mustnotbecalledfullyvalidated:itwritesbeforeversionOutputs validation.155isversionsfileonlyrestore,notatomicrollback.

Probe/stateful/deploymentrender/mixedversions181stillblocked. No newgenerator/globalAPI/runtime/live/gateclaim. Wholeproducersourcehashes match originalseal;priorcomplete11scriptSourceplan and actualhelper/receiver/callerreads support this finiteextension without another136sourceaudit.
