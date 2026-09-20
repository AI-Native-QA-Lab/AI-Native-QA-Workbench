# dsh-qa → ai-native-qa-workbench Migration Matrix

  dsh-qa Capability     Workbench Target             Action
  --------------------- ---------------------------- ----------------
  Project               Project                      REFACTOR
  Requirement           Requirement                  REFACTOR
  Test Case             TestCase                     REFACTOR
  Defect                Defect                       REFACTOR
  Milestone             Iteration/Planning           REUSE/REFACTOR
  Knowledge             KnowledgeItem                REFACTOR
  Report                Report                       REFACTOR
  Gate                  QualityGate                  REDESIGN
  Quality Task          QualityTask                  REFACTOR
  Analysis              QualityAssessment/Analysis   REDESIGN
  Test Run              TestRun                      REFACTOR
  QA tools              Tool packages                REFACTOR
  DeepSeek agent loop   Agent Runtime                REDESIGN
  DeepSeek API          Model Provider               REDESIGN
  DSH Session           DSH Adapter                  ADAPTER
  DSH Skill             Skill Registry/DSH Adapter   REDESIGN
  DSH Commands          DSH Adapter                  ADAPTER
  DSH model selection   DSH Adapter                  ADAPTER
  Cordis plugin         integrations/dsh             ADAPTER
  DOM injection         none                         DROP
  UI concepts           Workbench UI                 REUSE/REDESIGN

原则：迁移 capability，不复制 DSH assumptions。
