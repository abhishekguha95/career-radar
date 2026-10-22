import { z } from 'zod';

const text = z.string().trim().min(1).max(500);
const texts = z.array(text).max(100);
const country = z.string().regex(/^[A-Z]{2}$/);
const europeanCountry = z.enum(['SE', 'DK', 'FI', 'NO', 'NL', 'DE']);
const indiaLocationScope = z.enum(['GLOBAL_REMOTE_FROM_INDIA', 'INDIA_REMOTE', 'PREFERRED_CITY_HYBRID_OR_ON_SITE', 'EXCEPTIONAL_OTHER_INDIA']);

// This describes user preferences and user-stated evidence, not job assessments.
export const searchProfileSchema = z.object({
  schemaVersion: z.literal(1),
  profileId: z.string().regex(/^[a-z][a-z0-9-]{0,79}$/),
  capturedOn: z.iso.date(),
  review: z.object({ status: z.enum(['DRAFT', 'REVIEWED']), reviewedAt: z.iso.datetime({ offset: true }).nullable() }).strict(),
  candidate: z.object({
    evidenceLevel: z.literal('USER_STATED'),
    currentLocation: z.object({ city: text, countryCode: country }).strict(),
    approximateYearsExperience: z.number().min(0).max(80).nullable(),
    productionOwnership: z.object({
      applicationCount: z.number().int().nonnegative().max(1000).nullable(), environments: texts, capabilities: texts,
    }).strict(),
    skills: z.object({ strongProduction: texts.nonempty(), developing: texts, learningOrPortfolio: texts }).strict(),
    unknowns: z.object({
      citizenship: country.nullable(),
      workAuthorizations: z.array(z.object({ countryCode: country, status: z.enum(['UNKNOWN', 'HELD', 'NOT_HELD']) }).strict()).max(100),
      currentAnnualCashInr: z.number().nonnegative().nullable(),
      noticePeriodDays: z.number().int().nonnegative().max(1000).nullable(),
    }).strict(),
  }).strict(),
  sharedSearch: z.object({
    targetRoles: texts.nonempty(), stretchRoles: texts,
    preferredSectors: texts, preferredCompanyTraits: texts,
    deprioritize: z.object({ primaryLanguages: texts, roleCharacteristics: texts, expertOnlyRequirements: texts }).strict(),
    rankingPriorities: texts.nonempty(),
    namedTargetEmployers: texts,
    compensationPreference: z.object({ minimumAnnualBaseInr: z.number().nonnegative().nullable() }).strict(),
  }).strict(),
  scheduleIntent: z.object({
    cadence: z.literal('DAILY'), timeZone: z.string().max(100).refine((value) => {
      try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; }
    }, 'Expected a supported time zone'),
    period: z.literal('MORNING'), localTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).nullable(),
  }).strict(),
  briefing: z.object({
    maximumResultsPerTrack: z.number().int().min(1).max(10), allowFewerResults: z.literal(true),
    freshness: z.object({
      preferredLookbackDays: z.object({ minimum: z.number().int().nonnegative(), maximum: z.number().int().nonnegative() }).strict(),
      hardCutoff: z.literal(false), missingPostingDate: z.literal('UNKNOWN'),
    }).strict(),
    requiredFields: texts.nonempty(), minimumConcreteTechnicalMatches: z.number().int().min(1).max(10),
    evidenceLabels: z.tuple([z.literal('CONFIRMED'), z.literal('INDICATED'), z.literal('UNVERIFIED')]),
    fitVerdicts: z.tuple([z.literal('HIGH_FIT'), z.literal('GOOD_FIT'), z.literal('STRETCH')]),
    compensation: z.object({ indiaDisplayCurrency: z.literal('INR'), indiaDisplayPeriod: z.literal('ANNUAL'), reportPublishedCashCompensation: z.literal(true), missingLabel: z.literal('NOT DISCLOSED'), distinguishBaseBonusEquity: z.literal(true), inventAmounts: z.literal(false) }).strict(),
    maximumApplyFirstRecommendations: z.number().int().min(1).max(3),
    resumeOrOutreachSuggestions: z.literal(1), interviewPreparationTopics: z.literal(1),
    useVerifiableAccomplishmentsOnly: z.literal(true),
  }).strict(),
  historyIntent: z.object({
    reobserveKnownPostings: z.literal(true), suppressUnchangedReportedRepeats: z.literal(true),
    keepUnreportedCandidates: z.literal(true), resurfaceMaterialChanges: z.literal(true),
    noAutomaticClosureOnMissingOrFailedCrawls: z.literal(true),
  }).strict(),
  tracks: z.object({
    indiaGlobalRemote: z.object({
      id: z.literal('INDIA_GLOBAL_REMOTE'),
      locationPreferenceOrder: z.array(indiaLocationScope).length(4),
      preferredCity: text, exceptionalCities: texts,
      otherIndiaCities: z.literal('ONLY_WITH_COMPELLING_JUSTIFICATION'), tradeoffJustifications: texts.nonempty(),
      indiaEmploymentEvidence: z.object({
        requireRoleSpecificPermission: z.literal(true),
        acceptableRoutes: z.tuple([z.literal('INDIAN_LEGAL_ENTITY'), z.literal('COMPLIANT_EOR'), z.literal('DOCUMENTED_INDIA_ELIGIBILITY')]),
        remoteUsOrEuIsInsufficient: z.literal(true), verifyWorkAuthorizationSeparately: z.literal(true),
      }).strict(),
      excludeEuropeanRelocation: z.literal(true),
    }).strict(),
    europeRelocation: z.object({
      id: z.literal('EUROPE_RELOCATION'), countryPriorityTiers: z.array(z.array(europeanCountry).min(1).max(6)).min(1).max(6),
      workModels: z.array(z.enum(['ON_SITE', 'HYBRID', 'EMPLOYER_SUPPORTED_EUROPEAN_REMOTE_ROUTE'])).min(1).max(3),
      englishRequirement: z.literal('RECORD_EXPLICIT_EVIDENCE_OR_UNKNOWN'),
      requireEuropeanEmploymentGoal: z.literal(true), excludeIndiaEmploymentAndRemoteFromIndia: z.literal(true),
      authorizationEvidence: z.object({
        assessApplicantsFromIndia: z.literal(true), assessSponsorshipAndRelocationSeparately: z.literal(true),
        existingEuropeanAuthorizationRequirement: z.literal('REJECT_UNLESS_CREDIBLE_EMPLOYER_SUPPORT'),
        relocationDoesNotEstablishSponsorship: z.literal(true), euRemoteDoesNotEstablishIndiaEligibility: z.literal(true),
        missingEvidence: z.literal('UNVERIFIED'),
      }).strict(),
      accountabilityCheck: z.object({
        weekday: z.literal('THURSDAY'), knownHistoryOnly: z.literal(true),
        missingHistory: z.literal('STATE_UNAVAILABLE_AND_REQUEST_CONCISE_COUNTS'), maximumNextActions: z.literal(2),
      }).strict(),
    }).strict(),
  }).strict(),
}).strict().superRefine((profile, context) => {
  if ((profile.review.status === 'REVIEWED') !== (profile.review.reviewedAt !== null)) {
    context.addIssue({ code: 'custom', path: ['review'], message: 'Review status and timestamp must agree' });
  }
  const skillNames = Object.values(profile.candidate.skills).flat().map((value) => value.toLowerCase());
  if (new Set(skillNames).size !== skillNames.length) {
    context.addIssue({ code: 'custom', path: ['candidate', 'skills'], message: 'Skills must be unique across proficiency groups' });
  }
  const authorizationCountries = profile.candidate.unknowns.workAuthorizations.map((value) => value.countryCode);
  if (new Set(authorizationCountries).size !== authorizationCountries.length) {
    context.addIssue({ code: 'custom', path: ['candidate', 'unknowns', 'workAuthorizations'], message: 'Authorization countries must be unique' });
  }
  const indiaScopes = profile.tracks.indiaGlobalRemote.locationPreferenceOrder;
  if (new Set(indiaScopes).size !== indiaScopes.length) {
    context.addIssue({ code: 'custom', path: ['tracks', 'indiaGlobalRemote', 'locationPreferenceOrder'], message: 'Location scopes must occur once each' });
  }
  const europeCountries = profile.tracks.europeRelocation.countryPriorityTiers.flat();
  if (new Set(europeCountries).size !== europeCountries.length) {
    context.addIssue({ code: 'custom', path: ['tracks', 'europeRelocation', 'countryPriorityTiers'], message: 'Country priorities must be unique across tiers' });
  }
  const age = profile.briefing.freshness.preferredLookbackDays;
  if (age.minimum > age.maximum) context.addIssue({ code: 'custom', path: ['briefing', 'freshness'], message: 'Lookback range is reversed' });
});

export type SearchProfile = z.infer<typeof searchProfileSchema>;
