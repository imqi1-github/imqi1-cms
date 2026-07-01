export interface SkillStackItem {
  label: string;
  icon?: string;
  mark?: string;
}

export interface SkillGroup {
  key: string;
  title: string;
  short: string;
  tabTitle: string;
  role: string;
  eyebrow: string;
  summary: string;
  stacks: SkillStackItem[];
}

export interface ProfileTag {
  icon: string;
  label: string;
}
