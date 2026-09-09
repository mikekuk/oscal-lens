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
      'set-parameters': [{
        'param-id': 'ac-1_prm',
        values: ['every six months']
      }]
    }
  }
};
