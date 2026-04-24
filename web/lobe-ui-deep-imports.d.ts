declare module '@lobehub/ui/es/Input/Input' {
  import type { InputProps } from '@lobehub/ui/es/Input/type';
  import type { NamedExoticComponent } from 'react';

  const Input: NamedExoticComponent<InputProps>;
  export default Input;
}

declare module '@lobehub/ui/es/Input/TextArea' {
  import type { TextAreaProps } from '@lobehub/ui/es/Input/type';
  import type { NamedExoticComponent } from 'react';

  const TextArea: NamedExoticComponent<TextAreaProps>;
  export default TextArea;
}

declare module '@lobehub/ui/es/Input/InputPassword' {
  import type { InputPasswordProps } from '@lobehub/ui/es/Input/type';
  import type { NamedExoticComponent } from 'react';

  const InputPassword: NamedExoticComponent<InputPasswordProps>;
  export default InputPassword;
}

declare module '@lobehub/ui/es/Select/Select' {
  import type { SelectProps } from '@lobehub/ui/es/Select/type';
  import type { NamedExoticComponent } from 'react';

  const Select: NamedExoticComponent<SelectProps>;
  export default Select;
}

declare module '@lobehub/ui/es/Tag/Tag' {
  import type { TagProps } from '@lobehub/ui/es/Tag/type';
  import type { FC } from 'react';

  const Tag: FC<TagProps>;
  export default Tag;
}
