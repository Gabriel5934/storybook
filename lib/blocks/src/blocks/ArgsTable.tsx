import React, { FC, useContext, useEffect, useState, useCallback } from 'react';
import mapValues from 'lodash/mapValues';
import { ArgTypesExtractor } from '@storybook/docs-tools';
import { addons } from '@storybook/addons';
import { filterArgTypes, PropDescriptor, Story } from '@storybook/store';
import Events from '@storybook/core-events';
import { StrictArgTypes, Args, Globals, StoryId } from '@storybook/csf';
import {
  ArgsTable as PureArgsTable,
  ArgsTableProps as PureArgsTableProps,
  ArgsTableError,
  SortType,
  TabbedArgsTable,
} from '../components';

import { DocsContext, DocsContextProps } from './DocsContext';
import { Component, CURRENT_SELECTION, currentSelectionWarning, PRIMARY_STORY } from './types';
import { getComponentName } from './utils';
import { useStory } from './useStory';

interface BaseProps {
  include?: PropDescriptor;
  exclude?: PropDescriptor;
  sort?: SortType;
}

type OfProps = BaseProps & {
  of: '^' | Component;
};

type ComponentsProps = BaseProps & {
  components: {
    [label: string]: Component;
  };
};

type StoryProps = BaseProps & {
  story: '.' | '^' | string;
  showComponent?: boolean;
};

type ArgsTableProps = BaseProps | OfProps | ComponentsProps | StoryProps;

const useArgs = (
  storyId: string,
  context: DocsContextProps
): [Args, (args: Args) => void, (argNames?: string[]) => void] => {
  const channel = addons.getChannel();
  const storyContext = context.getStoryContext(context.storyById());

  const [args, setArgs] = useState(storyContext.args);
  useEffect(() => {
    const cb = (changed: { storyId: string; args: Args }) => {
      if (changed.storyId === storyId) {
        setArgs(changed.args);
      }
    };
    channel.on(Events.STORY_ARGS_UPDATED, cb);
    return () => channel.off(Events.STORY_ARGS_UPDATED, cb);
  }, [storyId]);
  const updateArgs = useCallback(
    (updatedArgs) => channel.emit(Events.UPDATE_STORY_ARGS, { storyId, updatedArgs }),
    [storyId]
  );
  const resetArgs = useCallback(
    (argNames?: string[]) => channel.emit(Events.RESET_STORY_ARGS, { storyId, argNames }),
    [storyId]
  );
  return [args, updateArgs, resetArgs];
};

const useGlobals = (context: DocsContextProps): [Globals] => {
  const channel = addons.getChannel();
  const storyContext = context.getStoryContext(context.storyById());
  const [globals, setGlobals] = useState(storyContext.globals);

  useEffect(() => {
    const cb = (changed: { globals: Globals }) => {
      setGlobals(changed.globals);
    };
    channel.on(Events.GLOBALS_UPDATED, cb);
    return () => channel.off(Events.GLOBALS_UPDATED, cb);
  }, []);

  return [globals];
};

export const extractComponentArgTypes = (
  component: Component,
  context: DocsContextProps,
  include?: PropDescriptor,
  exclude?: PropDescriptor
): StrictArgTypes => {
  const { parameters } = context.storyById();
  const { extractArgTypes }: { extractArgTypes: ArgTypesExtractor } = parameters.docs || {};
  if (!extractArgTypes) {
    throw new Error(ArgsTableError.ARGS_UNSUPPORTED);
  }
  let argTypes = extractArgTypes(component);
  argTypes = filterArgTypes(argTypes, include, exclude);

  return argTypes;
};

const isShortcut = (value?: string) => {
  return value && [CURRENT_SELECTION, PRIMARY_STORY].includes(value);
};

export const getStory = (props: ArgsTableProps = {}, context: DocsContextProps): Story => {
  const { of } = props as OfProps;
  const { story } = props as StoryProps;

  if (isShortcut(of) || isShortcut(story)) {
    return context.storyById();
  }

  try {
    // of=storyReference
    return context.storyById(context.storyIdByModuleExport(of));
  } catch (err) {
    return null;
  }
};

const addComponentTabs = (
  tabs: Record<string, PureArgsTableProps>,
  components: Record<string, Component>,
  context: DocsContextProps,
  include?: PropDescriptor,
  exclude?: PropDescriptor,
  sort?: SortType
) => ({
  ...tabs,
  ...mapValues(components, (comp) => ({
    rows: extractComponentArgTypes(comp, context, include, exclude),
    sort,
  })),
});

export const StoryTable: FC<
  StoryProps & { loadedStory: Story; subcomponents: Record<string, Component> }
> = (props) => {
  const context = useContext(DocsContext);
  const { loadedStory: story, subcomponents, showComponent, include, exclude, sort } = props;
  const { component } = story;
  try {
    // eslint-disable-next-line prefer-const
    let [args, updateArgs, resetArgs] = useArgs(story.id, context);
    const [globals] = useGlobals(context);
    if (!story) return <PureArgsTable isLoading updateArgs={updateArgs} resetArgs={resetArgs} />;

    const argTypes = filterArgTypes(story.argTypes, include, exclude);

    const mainLabel = getComponentName(component) || 'Story';

    let tabs = { [mainLabel]: { rows: argTypes, args, globals, updateArgs, resetArgs } } as Record<
      string,
      PureArgsTableProps
    >;

    // Use the dynamically generated component tabs if there are no controls
    const storyHasArgsWithControls = argTypes && Object.values(argTypes).find((v) => !!v?.control);

    if (!storyHasArgsWithControls) {
      updateArgs = null;
      resetArgs = null;
      tabs = {};
    }

    if (component && (!storyHasArgsWithControls || showComponent)) {
      tabs = addComponentTabs(tabs, { [mainLabel]: component }, context, include, exclude);
    }

    if (subcomponents) {
      if (Array.isArray(subcomponents)) {
        throw new Error(
          `Unexpected subcomponents array. Expected an object whose keys are tab labels and whose values are components.`
        );
      }
      tabs = addComponentTabs(tabs, subcomponents, context, include, exclude);
    }
    return <TabbedArgsTable tabs={tabs} sort={sort} />;
  } catch (err) {
    return <PureArgsTable error={err.message} />;
  }
};

export const ComponentsTable: FC<ComponentsProps> = (props) => {
  const context = useContext(DocsContext);
  const { components, include, exclude, sort } = props;

  const tabs = addComponentTabs({}, components, context, include, exclude);
  return <TabbedArgsTable tabs={tabs} sort={sort} />;
};

export const ArgsTable: FC<ArgsTableProps> = (props) => {
  const context = useContext(DocsContext);
  const {
    parameters: { controls },
    subcomponents,
  } = context.storyById();

  const { include, exclude, components, sort: sortProp } = props as ComponentsProps;
  const { story: storyName } = props as StoryProps;

  const sort = sortProp || controls?.sort;

  const story = getStory(props, context);
  if (story) {
    return <StoryTable {...props} loadedStory={story} {...{ subcomponents, sort }} />;
  }

  const main = (props as OfProps).of;
  if (!main) throw new Error(ArgsTableError.NO_COMPONENT);
  if (!components && !subcomponents) {
    let mainProps;
    try {
      mainProps = { rows: extractComponentArgTypes(main, context, include, exclude) };
    } catch (err) {
      mainProps = { error: err.message };
    }

    return <PureArgsTable {...mainProps} sort={sort} />;
  }

  if (components) {
    return <ComponentsTable {...(props as ComponentsProps)} {...{ components, sort }} />;
  }

  const mainLabel = getComponentName(main);
  return (
    <ComponentsTable
      {...(props as ComponentsProps)}
      components={{ [mainLabel]: main, ...subcomponents }}
      sort={sort}
    />
  );
};

ArgsTable.defaultProps = {
  of: PRIMARY_STORY,
};
