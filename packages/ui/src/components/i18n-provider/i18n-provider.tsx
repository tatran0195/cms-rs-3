'use client';

import { I18nProvider as Primitive, type I18nProviderProps as Props } from 'react-aria';

interface I18nProviderProps extends Props {}

const I18nProvider = (props: I18nProviderProps) => <Primitive {...props} />;

export { I18nProvider };
