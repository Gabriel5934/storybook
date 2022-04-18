export type { RenderContext } from '@storybook/core-client';

export type StoryFnHtmlReturnType = string | Node;

export interface IStorybookStory {
  name: string;
  render: (context: any) => any;
}

export interface IStorybookSection {
  kind: string;
  stories: IStorybookStory[];
}

export interface ShowErrorArgs {
  title: string;
  description: string;
}
