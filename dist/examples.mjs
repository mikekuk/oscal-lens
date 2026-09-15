// Synthetic examples for the initial workspace. These are not an official baseline.
// The caller clones them so reloading the demo starts from the original values.

const metadata = title => ({
  title,
  'last-modified': '2026-09-08T00:00:00Z',
  version: '1.0',
  'oscal-version': '1.0.4',
  remarks: 'An illustrative example, not an official NIST baseline.'
});
const control = (id, title, prose, extra = {}) => ({
  id,
  title,
  parts: [{
    id: id + '_smt',
    name: 'statement',
    prose
  }],
  ...extra
});
export const exampleCatalog = {
  catalog: {
    uuid: '1562cb25-7d8d-4bf4-b391-a7a31e6f1261',
    metadata: metadata('Example security catalogue'),
    groups: [{
      id: 'ac',
      title: 'Access control',
      parts: [{
        name: 'overview',
        prose: 'Limit access to authorised people and processes. This group-level guidance remains useful even when a profile selects only some controls.'
      }],
      groups: [{
        id: 'ac-policy',
        title: 'Policy & governance',
        controls: [control('ac-1', 'Policy and procedures',
          'Develop, document and review access control policy.', {
            params: [{
              id: 'ac-1_prm',
              label: 'review frequency',
              values: ['annually']
            }],
            props: [{
              name: 'label',
              value: 'AC-1'
            }],
            parts: [{
              name: 'statement',
              prose: 'Review policy {{ insert: param, ac-1_prm }}.'
            }, {
              name: 'guidance',
              prose: 'Align access policy with the organisation’s business needs and responsibilities.'
            }]
          })]
      }],
      controls: [control('ac-2', 'Account management',
        'Define and manage account types, ownership and access authorisations.', {
          controls: [control('ac-2.1', 'Automated account management',
            'Use automated mechanisms to support the management of accounts.')]
        }), control('ac-3', 'Access enforcement',
        'Enforce approved authorisations for logical access to information.')]
    }, {
      id: 'au',
      title: 'Audit & accountability',
      parts: [{
        name: 'overview',
        prose: 'Create records that help reconstruct and review security-relevant activity.'
      }],
      controls: [control('au-1', 'Audit policy and procedures',
        'Establish responsibilities for audit and accountability.'), control('au-2',
        'Event logging', 'Identify the types of events the system can log.')]
    }],
    'back-matter': {
      resources: [{
        uuid: 'ea4acaaa-68bb-4579-a6e2-f1701dff9f98',
        title: 'Example supporting material',
        description: 'This workspace demonstrates nested groups, control enhancements, parameter tailoring and grey matter.'
      }]
    }
  }
};
export const exampleProfile = {
  profile: {
    uuid: 'a3350bd9-5d93-4c5b-9e5b-304fd5f2b93a',
    metadata: metadata('Essential security profile'),
    imports: [{
      href: 'example-catalog.json',
      'include-controls': [{
        'with-ids': ['ac-1', 'ac-2', 'au-2'],
        'with-child-controls': 'yes'
      }]
    }],
    merge: {
      'as-is': true
    },
    modify: {
      alters: [{'control-id': 'ac-1', adds: [{parts: [{id: 'ac-1_profile-note', name: 'guidance', prose: 'Record each review in the policy register.'}]}]}],
      'set-parameters': [{
        'param-id': 'ac-1_prm',
        values: ['every six months']
      }]
    }
  }
};

export const exampleMappedCatalog = {
  catalog: {
    uuid: '837a10d9-d903-49e1-8941-1a8b62e29a31',
    metadata: metadata('Example assurance catalogue'),
    controls: [
      control('gov-1', 'Policy review', 'Review the access policy at least annually and record approval.'),
      control('log-1', 'Logging coverage', 'Document and review the security events selected for logging.')
    ]
  }
};
export const exampleMapping = {
  'mapping-collection': {
    uuid: '62492565-7a16-4616-8b26-4b323a508f51',
    metadata: {...metadata('Example control relationships'), 'oscal-version': '1.2.3'},
    provenance: {
      method: 'human', 'matching-rationale': 'semantic', status: 'draft',
      'mapping-description': 'Illustrative relationships for exploring the viewer; not an authoritative mapping.'
    },
    mappings: [
      {
        uuid: 'ac0629d6-9d01-4ae8-b427-01c1a0eb8131',
        'source-resource': {type: 'profile', href: 'example-profile.json'},
        'target-resource': {type: 'catalog', href: 'example-assurance.json'},
        maps: [
          {uuid: '8f7c1bd0-ebaf-4f69-905f-dbd39ac18309', relationship: 'intersects-with',
            sources: [{type: 'control', 'id-ref': 'ac-1'}],
            targets: [{type: 'statement', 'id-ref': 'gov-1_smt'}],
            remarks: 'Both address review. The profile requires six-monthly review; the assurance statement also requires recorded approval.'},
          {uuid: '6f693b2a-3927-4c37-a2e7-a1b9ef4cbd5a', relationship: 'intersects-with',
            sources: [{type: 'statement', 'id-ref': 'au-2_smt'}],
            targets: [{type: 'control', 'id-ref': 'log-1'}],
            remarks: 'Both address logging scope, with different documentation and review requirements.'}
        ]
      },
      {
        uuid: '116408a8-71c1-481d-aa41-aadff2b5da5a',
        'source-resource': {type: 'catalog', href: 'example-catalog.json'},
        'target-resource': {type: 'catalog', href: 'example-assurance.json'},
        maps: [{uuid: 'fe7e9ab6-a28b-46d7-b56f-d52a51fa9b21', relationship: 'subset-of',
          sources: [{type: 'control', 'id-ref': 'ac-1'}],
          targets: [{type: 'control', 'id-ref': 'gov-1'}],
          remarks: 'The assurance control also requires recorded approval.'}]
      }
    ]
  }
};
