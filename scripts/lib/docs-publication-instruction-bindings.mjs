// Finite content-specific command and literal-host responsibilities.
// These are syntax inputs, never permission or execution results.
export const textCommandReferences = [
  "docs/site/extend/platform/buster.md#block-1",
  "docs/site/extend/plugin-catalogue/kubeclaw-agent-observer.md#block-2",
  "docs/site/extend/plugin-catalogue/kubeclaw.agent-observability.md#block-2",
  "docs/site/extend/plugin-catalogue/kubeclaw.api-flow.md#block-2",
  "docs/site/extend/plugin-catalogue/kubeclaw.architecture-validator.md#block-2",
  "docs/site/extend/plugin-catalogue/kubeclaw.artifact-store.md#block-2",
  "docs/site/extend/plugin-catalogue/kubeclaw.axe.md#block-2",
  "docs/site/extend/plugin-catalogue/kubeclaw.blueprint-sync.md#block-2",
  "docs/site/extend/plugin-catalogue/kubeclaw.buster-quality-gate.md#block-2",
  "docs/site/extend/plugin-catalogue/kubeclaw.case-study.md#block-2",
  "docs/site/extend/plugin-catalogue/kubeclaw.command-runner.md#block-2",
  "docs/site/extend/plugin-catalogue/kubeclaw.container-build.md#block-2",
  "docs/site/extend/plugin-catalogue/kubeclaw.coverage-budget.md#block-2",
  "docs/site/extend/plugin-catalogue/kubeclaw.delivery-lint.md#block-2",
  "docs/site/extend/plugin-catalogue/kubeclaw.demo-auth-smoke.md#block-2",
  "docs/site/extend/plugin-catalogue/kubeclaw.demo-handoff.md#block-2",
  "docs/site/extend/plugin-catalogue/kubeclaw.direct-command.md#block-2",
  "docs/site/extend/plugin-catalogue/kubeclaw.git-workspace.md#block-2",
  "docs/site/extend/plugin-catalogue/kubeclaw.http.md#block-2",
  "docs/site/extend/plugin-catalogue/kubeclaw.human-approval.md#block-2",
  "docs/site/extend/plugin-catalogue/kubeclaw.implementation-agent.md#block-2",
  "docs/site/extend/plugin-catalogue/kubeclaw.junit-report.md#block-2",
  "docs/site/extend/plugin-catalogue/kubeclaw.kubernetes-fixture.md#block-2",
  "docs/site/extend/plugin-catalogue/kubeclaw.lighthouse.md#block-2",
  "docs/site/extend/plugin-catalogue/kubeclaw.lint.md#block-2",
  "docs/site/extend/plugin-catalogue/kubeclaw.network-http.md#block-2",
  "docs/site/extend/plugin-catalogue/kubeclaw.notification-observer.md#block-2",
  "docs/site/extend/plugin-catalogue/kubeclaw.openapi.md#block-2",
  "docs/site/extend/plugin-catalogue/kubeclaw.openclaw-agent-events.md#block-2",
  "docs/site/extend/plugin-catalogue/kubeclaw.operator-messaging.md#block-2",
  "docs/site/extend/plugin-catalogue/kubeclaw.pipeline-review.md#block-2",
  "docs/site/extend/plugin-catalogue/kubeclaw.playwright.md#block-2",
  "docs/site/extend/plugin-catalogue/kubeclaw.preflight-contract.md#block-2",
  "docs/site/extend/plugin-catalogue/kubeclaw.prism-design.md#block-2",
  "docs/site/extend/plugin-catalogue/kubeclaw.project-summary.md#block-2",
  "docs/site/extend/plugin-catalogue/kubeclaw.redis-transport.md#block-2",
  "docs/site/extend/plugin-catalogue/kubeclaw.remote-test-gate.md#block-2",
  "docs/site/extend/plugin-catalogue/kubeclaw.repository-adapter.md#block-2",
  "docs/site/extend/plugin-catalogue/kubeclaw.review.md#block-2",
  "docs/site/extend/plugin-catalogue/kubeclaw.runtime-dispatch.md#block-2",
  "docs/site/extend/plugin-catalogue/kubeclaw.secret-resolver.md#block-2",
  "docs/site/extend/plugin-catalogue/kubeclaw.security-providers.md#block-2",
  "docs/site/extend/plugin-catalogue/kubeclaw.size-budget.md#block-2",
  "docs/site/extend/plugin-catalogue/kubeclaw.state-store.md#block-2",
  "docs/site/extend/plugin-catalogue/kubeclaw.tailscale-exposure.md#block-2",
  "docs/site/extend/plugin-catalogue/kubeclaw.telemetry-observer.md#block-2",
  "docs/site/extend/plugin-catalogue/kubeclaw.telemetry-store.md#block-2",
  "docs/site/extend/plugin-catalogue/kubeclaw.transport-publisher.md#block-2",
  "docs/site/extend/plugin-catalogue/kubeclaw.visual.md#block-2",
  "docs/site/extend/plugin-catalogue/kubeclaw.wait-store.md#block-2",
  "docs/site/reference/buster-runtime-configuration.md#block-2",
  "docs/site/reference/buster-runtime-configuration.md#block-3",
  "docs/site/reference/buster-runtime-configuration.md#block-4",
  "docs/site/reference/buster-runtime-configuration.md#block-5",
  "docs/site/reference/images-and-digests.md#block-2",
  "docs/site/use/workflows/buster-suite.md#block-1",
  "docs/site/use/workflows/buster-suite.md#block-2",
  "docs/site/use/workflows/buster-suite.md#block-3",
  "docs/site/use/workflows/buster-suite.md#block-5",
  "docs/site/use/workflows/buster-suite.md#block-6"
];
export const syntaxMaterializations = {
  "docs/site/extend/buster.md#block-6": [
    {
      "from": "<plugin-id>",
      "to": "kubeclaw.direct-command"
    }
  ],
  "docs/site/extend/buster.md#block-7": [
    {
      "from": "<package-directory>",
      "to": "direct-command"
    }
  ],
  "docs/site/extend/buster.md#block-9": [
    {
      "from": "<package-directory>",
      "to": "direct-command"
    }
  ],
  "docs/site/reference/images-and-digests.md#block-2": [
    {
      "from": "<runtime|ops>",
      "to": "runtime"
    },
    {
      "from": "<image-slot>",
      "to": "nova"
    },
    {
      "from": "<os/architecture[/variant]>",
      "to": "linux/amd64"
    },
    {
      "from": " [registry-bearer-token-file]",
      "to": ""
    }
  ]
};
export const embeddedProgramBindings = [
  {
    "ref": "docs/site/extend/developer-handbook.md#block-4",
    "start": 245,
    "length": 98,
    "sha256": "2b6106c9894d78df62fa137fd736a41b3e352f3c5a5d414570ca9fc8c732054c",
    "language": "javascript",
    "mode": "commonjs"
  },
  {
    "ref": "docs/site/extend/developer-handbook.md#block-17",
    "start": 141,
    "length": 21,
    "sha256": "51c4e5cc1f52955455187687e85c0629de02755aea78830f89728cddbc54bdc7",
    "language": "javascript",
    "mode": "commonjs"
  },
  {
    "ref": "docs/site/extend/developer-handbook.md#block-17",
    "start": 223,
    "length": 16,
    "sha256": "5f7e819b9ccfd6d50fe2ca3721a9af39726e501c92c0e19344d123ed9bcad32c",
    "language": "javascript",
    "mode": "commonjs"
  },
  {
    "ref": "docs/site/extend/developer-handbook.md#block-22",
    "start": 42,
    "length": 629,
    "sha256": "8db67876651994a1bf9d891fa64fcddb25c58c18cb95f757fa9b5663d75f3a4d",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/extend/developer-handbook.md#block-42",
    "start": 133,
    "length": 112,
    "sha256": "2d586914e8b4cbe31b4ecbab616870400ab3bd0d046f97b11f297e7e2b6c04db",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/extend/first-plugin.md#block-15",
    "start": 32,
    "length": 282,
    "sha256": "93ad74113f1d17d33e84fae1503d1ad9d4599361ac70d35f616c3e8cf3c8f478",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/extend/lint.md#block-2",
    "start": 53,
    "length": 35,
    "sha256": "911d3383945da143377d2b9e86057b86d879ecadf7f3dee336ccbb53d1d004d0",
    "language": "javascript",
    "mode": "commonjs"
  },
  {
    "ref": "docs/site/extend/lint.md#block-11",
    "start": 9,
    "length": 232,
    "sha256": "1c1294a873f5fe55c15611930d1a1a541bd3ec57cb0ab727ad39ec7c1730228c",
    "language": "javascript",
    "mode": "commonjs"
  },
  {
    "ref": "docs/site/extend/lint.md#block-11",
    "start": 252,
    "length": 170,
    "sha256": "3024af0765a04a3828e18e02c5f27d6e2c7250565078c7040ff0766524d5640d",
    "language": "javascript",
    "mode": "commonjs"
  },
  {
    "ref": "docs/site/extend/lint.md#block-11",
    "start": 433,
    "length": 174,
    "sha256": "494fa84db4f2e62f7d9b434eb88d2bdfddde8f66438825fe92e69fc5b9814deb",
    "language": "javascript",
    "mode": "commonjs"
  },
  {
    "ref": "docs/site/extend/testing.md#block-1",
    "start": 523,
    "length": 494,
    "sha256": "cd8a3ec7a1072e11b72a0c3affcd9ce8d520caebd434eee758428b401e112694",
    "language": "javascript",
    "mode": "commonjs"
  },
  {
    "ref": "docs/site/reference/project-pipeline-publication.md#block-3",
    "start": 32,
    "length": 510,
    "sha256": "5cb1f2cb1c9bdecda653c173fe20c88944d12db2d8141c89964c0a173dc31ce3",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/reference/project-pipeline-publication.md#block-4",
    "start": 291,
    "length": 642,
    "sha256": "b1ef2c38408cdc43eb0f071ac6f974b4b0a4dc5665ed2f7fc426f3eadad68805",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/reference/project-pipeline-publication.md#block-5",
    "start": 194,
    "length": 228,
    "sha256": "80a6644748b842c31ac1eb8d449ffbe246623fbaf1b786454b8c6cde7a1dcae4",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/reference/project-pipeline-publication.md#block-7",
    "start": 846,
    "length": 223,
    "sha256": "4034e95a6036e815fd9bb7edd3ae8cebe0035dc94a8dcb39cf1ff124483b29a7",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/reference/roles-and-package-ownership.md#block-1",
    "start": 34,
    "length": 454,
    "sha256": "269aa9209df07be84c6be312706b94ccf41a07a4d308548c46f63af345f1502b",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/understand/data-and-state.md#block-1",
    "start": 316,
    "length": 955,
    "sha256": "4174545d424ecaf77828acf6580c60c0f9b7aa2132b29c5cc93b1aefbd41bb0f",
    "language": "python",
    "mode": null
  },
  {
    "ref": "docs/site/use/diagnose.md#block-7",
    "start": 1993,
    "length": 298,
    "sha256": "cba2042fc57606c04544b4c700b61d22b45e01ed3cb2a6ac475b67903dabb215",
    "language": "javascript",
    "mode": "commonjs"
  },
  {
    "ref": "docs/site/use/diagnose.md#block-7",
    "start": 1137,
    "length": 397,
    "sha256": "849d01a135988850a0958a5eec275d35e0ffc05cbddb3f639bb379b97862f7e3",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/use/diagnose.md#block-7",
    "start": 2532,
    "length": 463,
    "sha256": "52a1a68ad7ce3dea0670faace85515cc9d89fbc458b3952d33e93662a3af0214",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/use/diagnose.md#block-7",
    "start": 3626,
    "length": 426,
    "sha256": "91a7a73bc4ff15c223ab28d484d8b3ce8fa55d791cbb7ca0624cea0740f89266",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/use/diagnose.md#block-7",
    "start": 4386,
    "length": 609,
    "sha256": "0df2cf6148f9306c442f1945ec3fbf8d887047aa20f857c96041852d35cdea60",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/use/diagnose.md#block-8",
    "start": 2424,
    "length": 597,
    "sha256": "9408618ac23a908be91a0d1e3707da7bdb3c45669b2d7e1ca7f6e0eaeb09dc5a",
    "language": "javascript",
    "mode": "commonjs"
  },
  {
    "ref": "docs/site/use/diagnose.md#block-9",
    "start": 1263,
    "length": 425,
    "sha256": "2b75ba6b8d5cc58de639b14714fc43fda571c27a2859053a1740e401d6b26b78",
    "language": "javascript",
    "mode": "commonjs"
  },
  {
    "ref": "docs/site/use/diagnose.md#block-9",
    "start": 148,
    "length": 627,
    "sha256": "833f1176f048cc77cff22e0187f54993059bed0858794d0c8cadbe0d790d02db",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/use/diagnose.md#block-10",
    "start": 4018,
    "length": 370,
    "sha256": "b587b44c1312950f3f717398ec1c4524c7505b7f0b062d662face462f0b9a799",
    "language": "javascript",
    "mode": "commonjs"
  },
  {
    "ref": "docs/site/use/diagnose.md#block-10",
    "start": 2213,
    "length": 195,
    "sha256": "bf78d3d74300f2d8f276a39b46809478789d2e723ee389268893219dc8dc7338",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/use/diagnose.md#block-10",
    "start": 2681,
    "length": 869,
    "sha256": "55b527eb2749c646bc6c82880c90476775cdc6aa7f5a8ccdd966e21ccda424b9",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/use/diagnose.md#block-13",
    "start": 261,
    "length": 588,
    "sha256": "c30fbb44365df2374dae1b256d50006c92a7340703a8dc923fd85800eaade120",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/use/diagnose.md#block-14",
    "start": 1083,
    "length": 781,
    "sha256": "33821e7aad5de95b80623905e64227ab9ebba9e55b54340e6d6046a1ac85d13c",
    "language": "javascript",
    "mode": "commonjs"
  },
  {
    "ref": "docs/site/use/diagnose.md#block-14",
    "start": 1992,
    "length": 178,
    "sha256": "999ee810b7bc055e15c757a22edf2b8cd591570ada81cc9540022d689b6aecd0",
    "language": "javascript",
    "mode": "commonjs"
  },
  {
    "ref": "docs/site/use/diagnose.md#block-14",
    "start": 3211,
    "length": 288,
    "sha256": "6cddf98ce5269c4a847ed859d356cc12957cb5637cd25d8842f90a7521689c37",
    "language": "javascript",
    "mode": "commonjs"
  },
  {
    "ref": "docs/site/use/diagnose.md#block-14",
    "start": 4034,
    "length": 203,
    "sha256": "49aeed5da6864c029f59f89dd9145b3f10aea59aea52fe46e69c8c6cc9430140",
    "language": "javascript",
    "mode": "commonjs"
  },
  {
    "ref": "docs/site/use/diagnose.md#block-14",
    "start": 4522,
    "length": 178,
    "sha256": "5a37a032753522e9c422ee232ba38a71c4072eac2d1a70856987d6f1c03f995a",
    "language": "javascript",
    "mode": "commonjs"
  },
  {
    "ref": "docs/site/use/diagnose.md#block-14",
    "start": 5026,
    "length": 126,
    "sha256": "d3bf52e598b662aba9394d1fd4e1c6f7fe2bd19452ab58e307b8c67f7e9c2d46",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/use/diagnose.md#block-14",
    "start": 5336,
    "length": 668,
    "sha256": "e9cb968fd1434825b66e7b3add9ae989d28cbe0d1e01fa0687a37e5a957d5f90",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/use/diagnose.md#block-15",
    "start": 309,
    "length": 333,
    "sha256": "a5c1ee8aa8f495dd2c8b0ae4ca1c6e56e658ab3c46df00f568591a3aa4a62d58",
    "language": "javascript",
    "mode": "commonjs"
  },
  {
    "ref": "docs/site/use/diagnose.md#block-15",
    "start": 883,
    "length": 178,
    "sha256": "7ecba8d965d1a40a57d9cd5d9fd0424b827c02099f958fd65116bb7d0f0aa177",
    "language": "javascript",
    "mode": "commonjs"
  },
  {
    "ref": "docs/site/use/diagnose.md#block-16",
    "start": 1930,
    "length": 752,
    "sha256": "b577c2676b4e78d0b7d584313bb387f62562a48823b12bf3eb6effe026ed3b5a",
    "language": "javascript",
    "mode": "commonjs"
  },
  {
    "ref": "docs/site/use/diagnose.md#block-16",
    "start": 8454,
    "length": 867,
    "sha256": "5f1c21561c7d1063c6f65d6c2ed7cf1ce9d541608dd6216217379c97c875cdd3",
    "language": "javascript",
    "mode": "commonjs"
  },
  {
    "ref": "docs/site/use/diagnose.md#block-16",
    "start": 9441,
    "length": 629,
    "sha256": "810754fe47f42e56cfc012401c281eeb9891b0a300f12253d6d1e30a2aa296a4",
    "language": "javascript",
    "mode": "commonjs"
  },
  {
    "ref": "docs/site/use/diagnose.md#block-16",
    "start": 912,
    "length": 220,
    "sha256": "0e3c931eaf8ece628dba38643766dc55f78ec3933f94b0ef3b4f1e83cb8a96ad",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/use/diagnose.md#block-16",
    "start": 2878,
    "length": 518,
    "sha256": "b5eba3242d67909eed5cec04dd179160b320c9fb1680e1c504f0e2c9b163022b",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/use/diagnose.md#block-16",
    "start": 5137,
    "length": 193,
    "sha256": "0b05af21d507d610b28e420f0d2013886b5e0efb03b2becae7b4d39592d1a929",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/use/diagnose.md#block-16",
    "start": 6362,
    "length": 229,
    "sha256": "e8e3e3bdf27cdccc1911ec7cf71ea0b26c9f9daf716c733fb458e501283feb7d",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/use/diagnose.md#block-16",
    "start": 7078,
    "length": 194,
    "sha256": "0b9be686d769cb9ce8e0e46e93476d0691120240b0b0c0f0382bd971c252876f",
    "language": "javascript",
    "mode": "commonjs"
  },
  {
    "ref": "docs/site/use/diagnose.md#block-17",
    "start": 813,
    "length": 4233,
    "sha256": "1ef5bc4e2c1018ddac24c44545cd86ca85639a44f1e5114adc91763c4e6984f1",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/use/diagnose.md#block-18",
    "start": 1002,
    "length": 851,
    "sha256": "bf6b92468899ae3a797cc4ff3ec644f7077ad1d56790771814484da8632a7952",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/use/diagnose.md#block-19",
    "start": 381,
    "length": 1997,
    "sha256": "a918ba366972d2a8cafbea827aa3e297ebf143d77eb744e857219e51381de60a",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/use/diagnose.md#block-19",
    "start": 2498,
    "length": 342,
    "sha256": "192c0c7ca781cb3340f31b7049ad8df4a9e20439a1be812ba13701f8fc3f9cb6",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/use/diagnose.md#block-20",
    "start": 305,
    "length": 690,
    "sha256": "9757fd5004c52cb4b112e4e77294e01b85e6aadd5b5c990883bd84a74af90fdb",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/use/diagnose.md#block-20",
    "start": 2142,
    "length": 57,
    "sha256": "5f013f49f00cff0a322722019598d2533dfc94859bdc5899013d21581fdb70ff",
    "language": "javascript",
    "mode": "commonjs"
  },
  {
    "ref": "docs/site/use/diagnose.md#block-20",
    "start": 2394,
    "length": 354,
    "sha256": "153309e86ac4fc58da9f18ce99b4daaded97acab58acd97e8e0137942f0c1f2a",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/use/diagnose.md#block-20",
    "start": 3056,
    "length": 862,
    "sha256": "000f84c3838e47c6d34efde7cd8b47986180cadb4458d3f82afd50a85fdce01a",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/use/diagnose.md#block-21",
    "start": 93,
    "length": 655,
    "sha256": "dad458ba0b6b63e196b293a83cbc72550a842e419cf80d3d0f74c608c068ed3e",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/use/diagnose.md#block-22",
    "start": 6096,
    "length": 586,
    "sha256": "f641c43d0e1c79ee6bf74a16521b6b10ce5da3ee4d5c15cd68d94c05fa385766",
    "language": "javascript",
    "mode": "commonjs"
  },
  {
    "ref": "docs/site/use/diagnose.md#block-22",
    "start": 155,
    "length": 574,
    "sha256": "eaad010479585108faf3ae8e0f9dcd6bd68eddd62bc4ddd63427d0e24cf70bd4",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/use/diagnose.md#block-22",
    "start": 1019,
    "length": 557,
    "sha256": "564d98645af54e30ed5a429e4618570558d82453c43671e38f9118eb77699b45",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/use/diagnose.md#block-22",
    "start": 1696,
    "length": 266,
    "sha256": "98dbc928535a6909dd171cc9d3cf00e85a4a5fe0498e6891987339749931bcc3",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/use/diagnose.md#block-22",
    "start": 2125,
    "length": 652,
    "sha256": "12f2da5043e3efd6ee054ae43cb6cd13925fd0fd59e92ad0b39a45cc5fef5521",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/use/diagnose.md#block-22",
    "start": 3526,
    "length": 234,
    "sha256": "4427b793a5e479dfc160759a101d99fe776c1c9284127cc5cf3151681fe89201",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/use/diagnose.md#block-22",
    "start": 4438,
    "length": 242,
    "sha256": "3b1ece6cc1de15c62d872dbe87c677638c2e5846c7af70de5350d03e9d50fbb2",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/use/diagnose.md#block-22",
    "start": 4973,
    "length": 582,
    "sha256": "ee5ef3fe45a747af1cdc4d37bc1b1d88c442171a37d1a5368c6c6a5e7d12e81c",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/use/diagnose.md#block-22",
    "start": 7058,
    "length": 1673,
    "sha256": "dc42d79020633b48e1fec72c9f725a1648e9bb2da53f570742fa80aac4b5562c",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/use/diagnose.md#block-24",
    "start": 105,
    "length": 573,
    "sha256": "a28cf0bb0297720c31ded3928e92d0d84ebc8904264179c5ef4240270e4a0365",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/use/diagnose.md#block-26",
    "start": 96,
    "length": 603,
    "sha256": "0afc32ba531bef178155739bd85024222a846a1ccd866b7124606918fefff5ad",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/use/diagnose.md#block-28",
    "start": 100,
    "length": 1414,
    "sha256": "ed2e5481ca0691c70747c9f1b6c96a1b5dc662fd341481ead1bff18286c03630",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/use/diagnose.md#block-30",
    "start": 449,
    "length": 973,
    "sha256": "c1a1f855cf45a8412eab30d3374fb426103b82fa0fe405ced07994a3e60617ad",
    "language": "javascript",
    "mode": "commonjs"
  },
  {
    "ref": "docs/site/use/diagnose.md#block-32",
    "start": 510,
    "length": 2188,
    "sha256": "28f186b026c492717f59a09d7abb29202350da348d83038b051dd1c19b1d78a7",
    "language": "javascript",
    "mode": "commonjs"
  },
  {
    "ref": "docs/site/use/diagnose.md#block-32",
    "start": 2743,
    "length": 145,
    "sha256": "4e1c6a3c347036f6cc278c391949e588ddeb02edbf020d29b3d167f33ccd3702",
    "language": "javascript",
    "mode": "commonjs"
  },
  {
    "ref": "docs/site/use/install.md#block-7",
    "start": 228,
    "length": 98,
    "sha256": "132c3811be9753806f06ec2d9510ddd1de2286fff4b59a5fbdd28755face0463",
    "language": "javascript",
    "mode": "commonjs"
  },
  {
    "ref": "docs/site/use/install.md#block-7",
    "start": 1364,
    "length": 370,
    "sha256": "81beec2e03b6c3adcdc34d76715d8d9c00e4d92e30fc8ae147bee39df7df1f19",
    "language": "javascript",
    "mode": "commonjs"
  },
  {
    "ref": "docs/site/use/install.md#block-9",
    "start": 3541,
    "length": 294,
    "sha256": "90b642218cef386fccd7506383b45387bdc86a5bd1b6828c07655089bf8a59ce",
    "language": "javascript",
    "mode": "commonjs"
  },
  {
    "ref": "docs/site/use/install.md#block-9",
    "start": 4048,
    "length": 491,
    "sha256": "975f337ce4ead1472e1f82efb7b74d694d7f6a97f802dc418181bb836b9c3f8c",
    "language": "javascript",
    "mode": "commonjs"
  },
  {
    "ref": "docs/site/use/install.md#block-9",
    "start": 7899,
    "length": 289,
    "sha256": "83811d2eb64cc7e42ac10d9191d40c812e16a5854e3060350eabc63322742f0d",
    "language": "javascript",
    "mode": "commonjs"
  },
  {
    "ref": "docs/site/use/install.md#block-9",
    "start": 177,
    "length": 161,
    "sha256": "11a6be560b48c47775d06e131bb5d760226e3608ae67564f4dc104f1c1db4838",
    "language": "javascript",
    "mode": "commonjs"
  },
  {
    "ref": "docs/site/use/install.md#block-12",
    "start": 175,
    "length": 525,
    "sha256": "dc4655bd0602001d69df36ba9688451c1d8adb8e2baa1cc38cbbdd499c082dac",
    "language": "javascript",
    "mode": "commonjs"
  },
  {
    "ref": "docs/site/use/install.md#block-12",
    "start": 1446,
    "length": 977,
    "sha256": "8bad205becb5fbd0b3ec8bf79e7111325483b02099717c20ff0df95b81121741",
    "language": "javascript",
    "mode": "commonjs"
  },
  {
    "ref": "docs/site/use/install.md#block-12",
    "start": 2468,
    "length": 106,
    "sha256": "1dd5a50b389c39bedbb3467af90e8643d6e1873d35e21d59ba84e37179bc50c8",
    "language": "javascript",
    "mode": "commonjs"
  },
  {
    "ref": "docs/site/use/maintenance.md#block-12",
    "start": 314,
    "length": 415,
    "sha256": "0181b5851b8b73f622931ca2d20172cdfd743a798960991dae73eac0b8390d73",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/use/maintenance.md#block-16",
    "start": 783,
    "length": 8805,
    "sha256": "dbf1c649fd33d805afc728823fcd397b4a87f004bd1cc93495de65cf76e56ee4",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/use/maintenance.md#block-21",
    "start": 353,
    "length": 1133,
    "sha256": "467844f19dac34aff2cc11e2d2b660df5c9275115452f8bff48ba36c2a660b66",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/use/maintenance.md#block-21",
    "start": 1757,
    "length": 1451,
    "sha256": "a0227874621340c740c08aba26ff6f26eae369e701c3e64600fa05251f92d412",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/use/operate.md#block-7",
    "start": 523,
    "length": 2185,
    "sha256": "38f996de4993de88637e9d98a818347758b190ee404eb7f5ca13748d68a390d5",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/use/operate.md#block-8",
    "start": 34,
    "length": 783,
    "sha256": "59be196ca78dc5bb9ff0ba0cfd0deabf834a1385e4d9e3f49abf29d121bdcd9c",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/use/prism-studio.md#block-12",
    "start": 434,
    "length": 1557,
    "sha256": "e6e1ac2e4a589f96ba93ad1b1d2027d272f4014296f734602a91f0c8da4dfd35",
    "language": "javascript",
    "mode": "commonjs"
  },
  {
    "ref": "docs/site/use/prism-studio.md#block-13",
    "start": 192,
    "length": 1690,
    "sha256": "3576c0599aa3746f317d6b50ef0b108711ed4fcd2f6ea581bb77f46be86b090c",
    "language": "javascript",
    "mode": "commonjs"
  },
  {
    "ref": "docs/site/use/quickstart.md#block-1",
    "start": 591,
    "length": 234,
    "sha256": "9f0916652663d908946c9e1ccef914676d6f32c82f440b0cef11bd06d614e288",
    "language": "javascript",
    "mode": "commonjs"
  },
  {
    "ref": "docs/site/use/quickstart.md#block-1",
    "start": 1168,
    "length": 98,
    "sha256": "2b6106c9894d78df62fa137fd736a41b3e352f3c5a5d414570ca9fc8c732054c",
    "language": "javascript",
    "mode": "commonjs"
  },
  {
    "ref": "docs/site/use/recovery.md#block-1",
    "start": 1455,
    "length": 436,
    "sha256": "f6a760e5c6ec82d1b6c5710efe5df4db7ba5ecc6a3debda349f4c040a1483c94",
    "language": "python",
    "mode": null
  },
  {
    "ref": "docs/site/use/recovery.md#block-1",
    "start": 2107,
    "length": 234,
    "sha256": "2cbfe42e396ba5c8ad429ac529df40a7f4c55a20690efc6ba93cfb43ecc14f66",
    "language": "python",
    "mode": null
  },
  {
    "ref": "docs/site/use/recovery.md#block-1",
    "start": 2683,
    "length": 764,
    "sha256": "5ad328e549583126a2f3d1cc9d1dc16f6dcd0a4306e0eeb7cb1cfd54daa4e32b",
    "language": "python",
    "mode": null
  },
  {
    "ref": "docs/site/use/recovery.md#block-1",
    "start": 4033,
    "length": 380,
    "sha256": "24219ae5f98a999d215b087ac03e9021812ea59d35155235b0ee8aa66888c3b1",
    "language": "python",
    "mode": null
  },
  {
    "ref": "docs/site/use/recovery.md#block-4",
    "start": 653,
    "length": 285,
    "sha256": "fcb80c3e882cbb1cfcb947b48bc78c5a0335b496f2820eef4de64cd93403f9cc",
    "language": "python",
    "mode": null
  },
  {
    "ref": "docs/site/use/recovery.md#block-7",
    "start": 845,
    "length": 532,
    "sha256": "292f2caad3edaafa72da25f9a47b4b3795cee6e1f78b3dfd1a4635d63ac0028a",
    "language": "javascript",
    "mode": "commonjs"
  },
  {
    "ref": "docs/site/use/worker-trust.md#block-1",
    "start": 368,
    "length": 1617,
    "sha256": "2aa08908d543ca623f38609681aeb7cdab519e348b910ecb8756244b1c962d89",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/use/workflows/README.md#block-2",
    "start": 9,
    "length": 309,
    "sha256": "8d6466bf49bbcd5862cc1ec51aa405f0d709162dfec9f77640f1c748521053d1",
    "language": "javascript",
    "mode": "commonjs"
  },
  {
    "ref": "docs/site/use/workflows/buster-suite.md#block-7",
    "start": 874,
    "length": 292,
    "sha256": "4405ad9066b9ac3db4c9bfe69f7113d24c0da2997fc6b7ebc2baf2c296c5c082",
    "language": "javascript",
    "mode": "commonjs"
  },
  {
    "ref": "docs/site/use/workflows/buster-suite.md#block-9",
    "start": 151,
    "length": 4187,
    "sha256": "84e876991fd6a3d6daa1be2d6cc3cb958aba2d40a32b17ad695cf527cfcdd05b",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/use/workflows/buster-suite.md#block-10",
    "start": 843,
    "length": 641,
    "sha256": "3e1a1b83d2071b973f3db14d08921cb629d4b69ec3cd2732d913c6de77f864f7",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/use/workflows/buster-suite.md#block-11",
    "start": 260,
    "length": 288,
    "sha256": "83d8d9dc89053943e6a7563dda6c1e2db76ee6293ef6d4a26c411ac6e31fcff6",
    "language": "javascript",
    "mode": "commonjs"
  },
  {
    "ref": "docs/site/use/workflows/buster-suite.md#block-13",
    "start": 122,
    "length": 3630,
    "sha256": "857ab7bddc2aad4f748f62d9d8d1007ddc051bcc5766c2c96161a5855e5aab7c",
    "language": "javascript",
    "mode": "commonjs"
  },
  {
    "ref": "docs/site/use/workflows/local-core.md#block-1",
    "start": 257,
    "length": 91,
    "sha256": "c5009995739e0ade3c331036669ff8bace3bce7f15736b921294208af0e8bf46",
    "language": "javascript",
    "mode": "commonjs"
  },
  {
    "ref": "docs/site/use/workflows/wait-resume.md#block-2",
    "start": 443,
    "length": 1684,
    "sha256": "5c81fa26271714df6dcb06a27bc687eae5e5e6dd48596a75f8805c50d56fe92f",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/use/workflows/wait-resume.md#block-2",
    "start": 154,
    "length": 95,
    "sha256": "b26764bba32454c2a45a1ec0c1c22546bc9d5e186f99d8f8edefac96366fdffc",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/use/workflows/wait-resume.md#block-2",
    "start": 329,
    "length": 76,
    "sha256": "013f7111e6de4ee0d7a2ee4c1b585af45822e9bdcc3fbb4532cbcbe759a2b38a",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/use/workflows/wait-resume.md#block-3",
    "start": 119,
    "length": 1478,
    "sha256": "a1e2dae87663b5fbdd3623953117f293cdec4bcfc4ede92449517b1a5c4ebfac",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/use/workflows/wait-resume.md#block-4",
    "start": 34,
    "length": 475,
    "sha256": "550f348333e43b58c51fb23d9cde5e1d9e463b691b05f949e8efa9a32bbf95f3",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/use/workflows/wait-resume.md#block-6",
    "start": 252,
    "length": 1088,
    "sha256": "6cf0c9ace013b98e530e94e6b0a5a7b9127b465217bd7093c2c6d9476e614ef2",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/use/workflows/wait-resume.md#block-7",
    "start": 34,
    "length": 1923,
    "sha256": "a0fb26fd9b06589907f84103e34999357e4e5115df067fc379b13a2c0327ce4f",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/use/workflows/wait-resume.md#block-8",
    "start": 75,
    "length": 1871,
    "sha256": "b46704653317483090098fc8f7ad09c728467d52d7669e2ea9886a93dd0d43a4",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/use/workflows/wait-resume.md#block-14",
    "start": 34,
    "length": 2002,
    "sha256": "0baa76539a5b82c141d661635f86560c792391e945f6a09cc3a382e52f55d2a0",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/use/workflows/wait-resume.md#block-16",
    "start": 111,
    "length": 349,
    "sha256": "915ada21923977160a090a9dd55d1166ffeaef5d6c38dc63cad67985d4677be1",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/use/workflows/wait-resume.md#block-17",
    "start": 130,
    "length": 1490,
    "sha256": "2ef30059f4981882d9f859b87b357f3433c8426709e8413ca3e3d819a0bbb508",
    "language": "javascript",
    "mode": "module"
  },
  {
    "ref": "docs/site/use/maintenance.md#block-5",
    "start": 253,
    "length": 1034,
    "sha256": "05fde6d0365027c6d9587bb4e1a51c1b02da39b166a671a459ac42b8a5cba5c2",
    "language": "python",
    "mode": null
  },
  {
    "ref": "docs/site/use/maintenance.md#block-5",
    "start": 1520,
    "length": 891,
    "sha256": "c098eee8193c0ec61bbcf4776038ed966814145ee69c840741210abf5f069537",
    "language": "python",
    "mode": null
  }
];
