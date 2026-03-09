export type OrgTreeNode = {
  value: string;
  label: string;
  children?: OrgTreeNode[];
};

export type TenantRole = 'followers' | 'reviewers';

export type TenantDepartment = {
  role: TenantRole;
  name: string;
  members: string[];
  aliases?: string[];
};

export type TenantProfile = {
  id: string;
  name: string;
  departments: [TenantDepartment, TenantDepartment];
  volumeFactor: number;
  emailBias: number;
  accuracyBias: number;
};

const ROOT_ORG_LABEL = '全公司';

const TENANT_PROFILES: TenantProfile[] = [
  {
    id: 'tenant-1001',
    name: '上港长江',
    volumeFactor: 1.15,
    emailBias: 0.12,
    accuracyBias: 0.018,
    departments: [
      {
        role: 'followers',
        name: '客服一部',
        members: ['陈雨', '王倩'],
        aliases: ['出口业务部', '客服部', '跟进组']
      },
      {
        role: 'reviewers',
        name: '操作一部',
        members: ['周凯', '孙宁'],
        aliases: ['订舱操作部', '操作部', '审核组']
      }
    ]
  },
  {
    id: 'tenant-1002',
    name: '宁波远洋',
    volumeFactor: 0.92,
    emailBias: -0.08,
    accuracyBias: -0.012,
    departments: [
      {
        role: 'followers',
        name: '国际客服部',
        members: ['何敏', '赵洁'],
        aliases: ['出口业务部', '客服部']
      },
      {
        role: 'reviewers',
        name: '订舱执行部',
        members: ['蒋帆', '林越'],
        aliases: ['订舱操作部', '操作部']
      }
    ]
  },
  {
    id: 'tenant-1003',
    name: '青岛海联',
    volumeFactor: 1.05,
    emailBias: 0.03,
    accuracyBias: 0.01,
    departments: [
      {
        role: 'followers',
        name: '跟单中心',
        members: ['高翔', '郑彤'],
        aliases: ['出口业务部', '客服部']
      },
      {
        role: 'reviewers',
        name: '舱位操作组',
        members: ['韩涛', '马会'],
        aliases: ['订舱操作部', '操作部']
      }
    ]
  },
  {
    id: 'tenant-1004',
    name: '厦门海丰',
    volumeFactor: 0.85,
    emailBias: -0.05,
    accuracyBias: -0.006,
    departments: [
      {
        role: 'followers',
        name: '客服运营部',
        members: ['罗阳', '谢妍'],
        aliases: ['出口业务部', '客服部']
      },
      {
        role: 'reviewers',
        name: '审核操作部',
        members: ['唐骏', '彭程'],
        aliases: ['订舱操作部', '操作部']
      }
    ]
  }
];

const buildOrgTree = (tenant: TenantProfile): OrgTreeNode[] => {
  const followerDept = tenant.departments.find((item) => item.role === 'followers');
  const reviewerDept = tenant.departments.find((item) => item.role === 'reviewers');

  const nodes: OrgTreeNode[] = [{ value: ROOT_ORG_LABEL, label: ROOT_ORG_LABEL }];

  if (followerDept) {
    nodes.push({
      value: followerDept.name,
      label: followerDept.name,
      children: followerDept.members.map((name) => ({ value: name, label: name }))
    });
  }

  if (reviewerDept) {
    nodes.push({
      value: reviewerDept.name,
      label: reviewerDept.name,
      children: reviewerDept.members.map((name) => ({ value: name, label: name }))
    });
  }

  return nodes;
};

export const TENANT_OPTIONS = TENANT_PROFILES.map((tenant) => ({
  id: tenant.id,
  name: tenant.name,
  orgTree: buildOrgTree(tenant)
}));

export const getTenantProfile = (tenantId: string): TenantProfile => {
  return TENANT_PROFILES.find((item) => item.id === tenantId) || TENANT_PROFILES[0];
};
