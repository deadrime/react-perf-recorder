import { memo, type ReactNode } from 'react';
import { useController, useForm, useFormState, useWatch, type Control } from 'react-hook-form';
import { bug } from '../../bugs';
import { priceStore } from '../../store/terminal';
import { useStore } from 'zustand';
import { useFieldError } from './useFieldError';

export interface OrderValues {
  amount: string;
  sl: string;
  tp: string;
}

type FormControl = Control<OrderValues>;

function useLiveTrade() {
  return useStore(priceStore, (s) => s.lastTrade.BTC);
}

function useTradeAtRender() {
  return priceStore.getState().lastTrade.BTC;
}

/** The estimate needs the price when the amount changes, not on every trade. */
const useEstimatePrice = bug('live-subscription') ? useLiveTrade : useTradeAtRender;

export const AmountInput = ({ control, trigger }: { control: FormControl; trigger: () => Promise<boolean> }) => {
  const { field } = useController({ control, name: 'amount', rules: { validate: (v) => !v || Number(v) > 0 || 'must be positive' } });
  const price = useEstimatePrice();
  return (
    <label style={{ display: 'block' }}>
      Amount
      <input
        {...field}
        data-testid="amount"
        placeholder="0"
        onChange={(e) => {
          field.onChange(e);
          // SL and TP depend on the amount, as in a real form.
          void trigger();
        }}
      />
      <small>≈ {(Number(field.value || 0) * price).toFixed(2)}</small>
    </label>
  );
};

function useStopWithFieldState(control: FormControl, name: 'sl' | 'tp') {
  const { field, fieldState } = useController({ control, name, rules: { validate: (v) => !v || Number(v) > 0 || 'must be positive' } });
  return { field, error: fieldState.error?.message };
}

function useStop(control: FormControl, name: 'sl' | 'tp') {
  const { field } = useController({ control, name, rules: { validate: (v) => !v || Number(v) > 0 || 'must be positive' } });
  return { field, error: useFieldError(control, name).message };
}

const useStopField = bug('field-state') ? useStopWithFieldState : useStop;

export const StopInput = ({ control, name }: { control: FormControl; name: 'sl' | 'tp' }) => {
  const { field, error } = useStopField(control, name);
  return (
    <label style={{ display: 'block' }}>
      {name.toUpperCase()}
      <input {...field} data-testid={name} placeholder="price" />
      {error && <em>{error}</em>}
    </label>
  );
};

export const ChangeRow = memo(({ title, value }: { title: ReactNode; value: string }) => (
  <div data-testid="change-row" style={{ display: 'flex', gap: 8 }}>
    {title}
    <span>{value}</span>
  </div>
));

const FeeTitle = () => <span>Fee</span>;
const feeTitle = <FeeTitle />;

export const OrderSummary = ({ control }: { control: FormControl }) => {
  const amount = useWatch({ control, name: 'amount' });
  return (
    <div data-testid="summary">
      <ChangeRow title={bug('inline-jsx-prop') ? <FeeTitle /> : feeTitle} value="0.1%" />
      <ChangeRow title="Size" value={amount || '0'} />
    </div>
  );
};

const SubmitButton = ({ control }: { control: FormControl }) => {
  const { isValid } = useFormState({ control });
  return (
    <button type="submit" data-testid="submit" disabled={!isValid}>
      Open
    </button>
  );
};

export const OrderForm = () => {
  const { control, handleSubmit, trigger, watch } = useForm<OrderValues>({ mode: 'onChange', defaultValues: { amount: '', sl: '', tp: '' } });
  // watch() in render subscribes the form root to every field.
  const filled = bug('form-watch') ? Object.values(watch()).filter(Boolean).length : null;
  return (
    <form data-testid="order-form" data-filled={filled ?? undefined} onSubmit={handleSubmit(() => {})}>
      <AmountInput control={control} trigger={() => trigger()} />
      <StopInput control={control} name="sl" />
      <StopInput control={control} name="tp" />
      <OrderSummary control={control} />
      <SubmitButton control={control} />
    </form>
  );
};
