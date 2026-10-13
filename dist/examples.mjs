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

const gatewayId = '1b77cd32-51ee-405e-a298-163d641519a1';
const spareId = '1b77cd32-51ee-405e-a298-163d641519a2';
export const exampleSSP = {'system-security-plan': {
  uuid: '1b77cd32-51ee-405e-a298-163d641519a3',
  metadata: metadata('Example system security plan'),
  'import-profile': {href: 'example-profile.json'},
  'system-characteristics': {
    'system-ids': [{id: 'example-system'}], 'system-name': 'Example service',
    description: 'Illustrative system for component browsing.',
    'security-sensitivity-level': 'low',
    'security-impact-level': {'security-objective-confidentiality': 'low', 'security-objective-integrity': 'low', 'security-objective-availability': 'low'},
    'system-information': {'information-types': [{title: 'Administrative information', description: 'Example service records.',
      'confidentiality-impact': {base: 'low'}, 'integrity-impact': {base: 'low'}, 'availability-impact': {base: 'low'}}]},
    status: {state: 'operational'}, 'authorization-boundary': {description: 'Example service boundary.'}
  },
  'system-implementation': {users: [{uuid: '1b77cd32-51ee-405e-a298-163d641519a9', 'authorized-privileges': [{title: 'Administrator', 'functions-performed': ['Administer service']}]}], components: [
    {uuid: gatewayId, type: 'software', title: 'Access gateway', description: 'Controls access to the service.', status: {state: 'operational'}},
    {uuid: spareId, type: 'software', title: 'Reporting service', description: 'Defined component with no implementation recorded.', status: {state: 'under-development'}}
  ]},
  'control-implementation': {description: 'Example control implementation.', 'implemented-requirements': [{
    uuid: '1b77cd32-51ee-405e-a298-163d641519a4', 'control-id': 'ac-1',
    'by-components': [{uuid: '1b77cd32-51ee-405e-a298-163d641519a5', 'component-uuid': gatewayId, description: 'The gateway enforces the approved access policy.', 'implementation-status': {state: 'implemented'}}],
    statements: [{'statement-id': 'ac-1_smt', uuid: '1b77cd32-51ee-405e-a298-163d641519a6',
      'by-components': [{uuid: '1b77cd32-51ee-405e-a298-163d641519a7', 'component-uuid': gatewayId, description: 'Gateway policy review follows the inherited profile frequency.', 'implementation-status': {state: 'partial', remarks: 'Review automation is being rolled out.'}}]}]
  }]}
}};
export const exampleComponentDefinition = {'component-definition': {
  uuid: '1b77cd32-51ee-405e-a298-163d641519a8', metadata: metadata('Example component definition'),
  components: [{uuid: gatewayId, type: 'software', title: 'Access gateway', description: 'Reusable access service.',
    'control-implementations': [{uuid: '2b77cd32-51ee-405e-a298-163d641519a1', source: 'example-profile.json', description: 'Implementation against the example profile.',
      'implemented-requirements': [{uuid: '2b77cd32-51ee-405e-a298-163d641519a2', 'control-id': 'ac-1', description: 'Provides configurable access policy enforcement.'}]}]
  }]
}};

/** A complete demo with every SSP status and two contributing components. */
export function implementationExampleWorkspace() {
  const catalog = structuredClone(exampleCatalog), profile = structuredClone(exampleProfile);
  const ssp = structuredClone(exampleSSP), definition = structuredClone(exampleComponentDefinition);
  const providerId = '3b77cd32-51ee-405e-a298-163d641519a1';
  const uuid = number => `4b77cd32-51ee-405e-a298-${String(number).padStart(12, '0')}`;
  const contribution = (number, component, state, description) => ({
    uuid: uuid(number), 'component-uuid': component, description,
    'implementation-status': {state}
  });
  catalog.catalog.groups[0].controls ||= [];
  catalog.catalog.groups[0].controls.push(
    control('ac-4', 'Information flow enforcement', 'Enforce approved information flow policies.'),
    control('ac-5', 'Separation of duties', 'Separate duties to reduce the risk of misuse.')
  );
  profile.profile.imports[0]['include-controls'][0]['with-ids'].push('ac-3', 'ac-4', 'ac-5');
  const system = ssp['system-security-plan'];
  system.metadata.title = 'Example SSP — implementation statuses';
  system['system-implementation'].components.push({uuid: providerId, type: 'service', title: 'Shared identity provider',
    description: 'Provides inherited identity and audit capabilities.', status: {state: 'operational'}});
  const requirements = system['control-implementation']['implemented-requirements'];
  requirements[0].statements[0]['by-components'].push(contribution(1, providerId, 'inherited', 'Policy enforcement is inherited from the shared identity provider.'));
  requirements.push(
    {uuid: uuid(2), 'control-id': 'ac-2', 'by-components': [
      contribution(3, gatewayId, 'implemented', 'Local account approvals and removal are fully implemented.'),
      contribution(4, providerId, 'inherited', 'Account lifecycle automation is inherited from the identity provider.')]},
    {uuid: uuid(5), 'control-id': 'ac-2.1', 'by-components': [
      contribution(6, gatewayId, 'planned', 'Automated account reconciliation is planned for the next release.')]},
    {uuid: uuid(7), 'control-id': 'au-2', 'by-components': [
      contribution(8, providerId, 'inherited', 'All event logging for this service is inherited from the identity provider.')]},
    {uuid: uuid(9), 'control-id': 'ac-3', 'by-components': [
      contribution(10, gatewayId, 'not-applicable', 'This illustrative requirement is outside the example system boundary.')]},
    {uuid: uuid(14), 'control-id': 'ac-5', 'by-components': [
      {...contribution(15, gatewayId, 'alternative', 'An independent approval workflow provides an alternative separation-of-duties implementation.'),
        'implementation-status': {state: 'alternative', remarks: 'Independent approval replaces a separate operator role in this example.'}}]}
  );
  const components = definition['component-definition'].components;
  const implementation = components[0]['control-implementations'][0];
  implementation['implemented-requirements'].push({uuid: uuid(11), 'control-id': 'ac-2', description: 'Provides configurable account lifecycle enforcement.'});
  components.push({uuid: providerId, type: 'service', title: 'Shared identity provider', description: 'Reusable identity and audit services.',
    'control-implementations': [{uuid: uuid(12), source: 'example-profile.json', description: 'Capabilities offered to consuming systems.',
      'implemented-requirements': [{uuid: uuid(13), 'control-id': 'au-2', description: 'Provides central event logging to consuming systems.'}]}]});
  return [
    {name: 'example-profile.json', doc: profile}, {name: 'example-catalog.json', doc: catalog},
    {name: 'example-assurance.json', doc: structuredClone(exampleMappedCatalog)},
    {name: 'example-mapping.json', doc: structuredClone(exampleMapping)},
    {name: 'example-ssp.json', doc: ssp}, {name: 'example-component.json', doc: definition}
  ];
}
