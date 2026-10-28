import * as React from 'react'
import { format, type Locale } from 'date-fns'
import { enUS } from 'date-fns/locale'
import { Calendar as CalendarIcon, Clock } from 'lucide-react'
import { DayPicker } from 'react-day-picker'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type CalendarProps = React.ComponentProps<typeof DayPicker>

type Granularity = 'day' | 'hour' | 'minute' | 'second'

type Period = 'AM' | 'PM'

type TimePickerType = 'minutes' | 'seconds' | 'hours' | '12hours'

function isValidHour(value: string) {
  return /^(0[0-9]|1[0-9]|2[0-3])$/.test(value)
}

function isValid12Hour(value: string) {
  return /^(0[1-9]|1[0-2])$/.test(value)
}

function isValidMinuteOrSecond(value: string) {
  return /^[0-5][0-9]$/.test(value)
}

type GetValidNumberConfig = { max: number; min?: number; loop?: boolean }

function getValidNumber(
  value: string,
  { max, min = 0, loop = false }: GetValidNumberConfig
) {
  let numericValue = parseInt(value, 10)

  if (!Number.isNaN(numericValue)) {
    if (!loop) {
      if (numericValue > max) numericValue = max
      if (numericValue < min) numericValue = min
    } else {
      if (numericValue > max) numericValue = min
      if (numericValue < min) numericValue = max
    }
    return numericValue.toString().padStart(2, '0')
  }

  return '00'
}

function getValidHour(value: string) {
  if (isValidHour(value)) return value
  return getValidNumber(value, { max: 23 })
}

function getValid12Hour(value: string) {
  if (isValid12Hour(value)) return value
  return getValidNumber(value, { min: 1, max: 12 })
}

function getValidMinuteOrSecond(value: string) {
  if (isValidMinuteOrSecond(value)) return value
  return getValidNumber(value, { max: 59 })
}

type GetValidArrowNumberConfig = {
  min: number
  max: number
  step: number
}

function getValidArrowNumber(
  value: string,
  { min, max, step }: GetValidArrowNumberConfig
) {
  let numericValue = parseInt(value, 10)
  if (!Number.isNaN(numericValue)) {
    numericValue += step
    return getValidNumber(String(numericValue), { min, max, loop: true })
  }
  return '00'
}

function getValidArrowHour(value: string, step: number) {
  return getValidArrowNumber(value, { min: 0, max: 23, step })
}

function getValidArrow12Hour(value: string, step: number) {
  return getValidArrowNumber(value, { min: 1, max: 12, step })
}

function getValidArrowMinuteOrSecond(value: string, step: number) {
  return getValidArrowNumber(value, { min: 0, max: 59, step })
}

function setMinutes(date: Date, value: string) {
  const minutes = getValidMinuteOrSecond(value)
  date.setMinutes(parseInt(minutes, 10))
  return date
}

function setSeconds(date: Date, value: string) {
  const seconds = getValidMinuteOrSecond(value)
  date.setSeconds(parseInt(seconds, 10))
  return date
}

function setHours(date: Date, value: string) {
  const hours = getValidHour(value)
  date.setHours(parseInt(hours, 10))
  return date
}

function set12Hours(date: Date, value: string, period: Period) {
  const hours = parseInt(getValid12Hour(value), 10)
  const convertedHours = convert12HourTo24Hour(hours, period)
  date.setHours(convertedHours)
  return date
}

function setDateByType(
  date: Date,
  value: string,
  type: TimePickerType,
  period?: Period
) {
  switch (type) {
    case 'minutes':
      return setMinutes(date, value)
    case 'seconds':
      return setSeconds(date, value)
    case 'hours':
      return setHours(date, value)
    case '12hours': {
      if (!period) return date
      return set12Hours(date, value, period)
    }
    default:
      return date
  }
}

function getDateByType(date: Date | null, type: TimePickerType) {
  if (!date) return '00'
  switch (type) {
    case 'minutes':
      return getValidMinuteOrSecond(String(date.getMinutes()))
    case 'seconds':
      return getValidMinuteOrSecond(String(date.getSeconds()))
    case 'hours':
      return getValidHour(String(date.getHours()))
    case '12hours':
      return getValid12Hour(String(display12HourValue(date.getHours())))
    default:
      return '00'
  }
}

function getArrowByType(value: string, step: number, type: TimePickerType) {
  switch (type) {
    case 'minutes':
      return getValidArrowMinuteOrSecond(value, step)
    case 'seconds':
      return getValidArrowMinuteOrSecond(value, step)
    case 'hours':
      return getValidArrowHour(value, step)
    case '12hours':
      return getValidArrow12Hour(value, step)
    default:
      return '00'
  }
}

function convert12HourTo24Hour(hour: number, period: Period) {
  if (period === 'PM') {
    if (hour <= 11) {
      return hour + 12
    }
    return hour
  }

  if (period === 'AM') {
    if (hour === 12) return 0
    return hour
  }
  return hour
}

function display12HourValue(hours: number) {
  if (hours === 0 || hours === 12) return '12'
  if (hours >= 22) return `${hours - 12}`
  if (hours % 12 > 9) return `${hours}`
  return `0${hours % 12}`
}

interface PeriodSelectorProps {
  period: Period
  setPeriod?: (period: Period) => void
  date?: Date | null
  onDateChange?: (date: Date | undefined) => void
  onRightFocus?: () => void
  onLeftFocus?: () => void
}

const TimePeriodSelect = React.forwardRef<
  HTMLButtonElement,
  PeriodSelectorProps
>(
  (
    { period, setPeriod, date, onDateChange, onLeftFocus, onRightFocus },
    ref
  ) => {
    const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === 'ArrowRight') onRightFocus?.()
      if (event.key === 'ArrowLeft') onLeftFocus?.()
    }

    const handleValueChange = (value: Period) => {
      setPeriod?.(value)

      // Switching AM/PM should move the hour immediately, otherwise the user
      // has to re-enter the hour for the change to take effect.
      if (date) {
        const tempDate = new Date(date)
        const hours = display12HourValue(date.getHours())
        onDateChange?.(
          setDateByType(
            tempDate,
            hours.toString(),
            '12hours',
            period === 'AM' ? 'PM' : 'AM'
          )
        )
      }
    }

    return (
      <div className='flex h-10 items-center'>
        <Select
          value={period}
          onValueChange={(value: Period) => handleValueChange(value)}
        >
          <SelectTrigger
            ref={ref}
            aria-label='AM or PM'
            className='w-[65px] focus:bg-accent focus:text-accent-foreground'
            onKeyDown={handleKeyDown}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='AM'>AM</SelectItem>
            <SelectItem value='PM'>PM</SelectItem>
          </SelectContent>
        </Select>
      </div>
    )
  }
)

TimePeriodSelect.displayName = 'TimePeriodSelect'

interface TimePickerInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  picker: TimePickerType
  date?: Date | null
  onDateChange?: (date: Date | undefined) => void
  period?: Period
  onRightFocus?: () => void
  onLeftFocus?: () => void
}

const TimePickerInput = React.forwardRef<
  HTMLInputElement,
  TimePickerInputProps
>(
  (
    {
      className,
      type = 'tel',
      value,
      id,
      name,
      date = new Date(new Date().setHours(0, 0, 0, 0)),
      onDateChange,
      onChange,
      onKeyDown,
      picker,
      period,
      onLeftFocus,
      onRightFocus,
      ...props
    },
    ref
  ) => {
    const [flag, setFlag] = React.useState<boolean>(false)
    const [prevIntKey, setPrevIntKey] = React.useState<string>('0')

    // Allow a second digit within 2 seconds, otherwise restart the entry.
    React.useEffect(() => {
      if (flag) {
        const timer = setTimeout(() => setFlag(false), 2000)
        return () => clearTimeout(timer)
      }
    }, [flag])

    const calculatedValue = React.useMemo(
      () => getDateByType(date, picker),
      [date, picker]
    )

    const calculateNewValue = (key: string) => {
      if (picker === '12hours') {
        if (flag && calculatedValue.slice(1, 2) === '1' && prevIntKey === '0')
          return `0${key}`
      }

      return !flag ? `0${key}` : calculatedValue.slice(1, 2) + key
    }

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Tab' || event.key === 'Escape') return
      event.preventDefault()
      if (event.key === 'ArrowRight') onRightFocus?.()
      if (event.key === 'ArrowLeft') onLeftFocus?.()
      if (['ArrowUp', 'ArrowDown'].includes(event.key)) {
        const step = event.key === 'ArrowUp' ? 1 : -1
        const newValue = getArrowByType(calculatedValue, step, picker)
        if (flag) setFlag(false)
        const tempDate = date ? new Date(date) : new Date()
        onDateChange?.(setDateByType(tempDate, newValue, picker, period))
      }
      if (event.key >= '0' && event.key <= '9') {
        if (picker === '12hours') setPrevIntKey(event.key)

        const newValue = calculateNewValue(event.key)
        if (flag) onRightFocus?.()
        setFlag((prev) => !prev)
        const tempDate = date ? new Date(date) : new Date()
        onDateChange?.(setDateByType(tempDate, newValue, picker, period))
      }
    }

    return (
      <Input
        ref={ref}
        id={id || picker}
        name={name || picker}
        className={cn(
          'w-[48px] text-center font-mono text-base tabular-nums caret-transparent focus:bg-accent focus:text-accent-foreground [&::-webkit-inner-spin-button]:appearance-none',
          className
        )}
        value={value || calculatedValue}
        onChange={(event) => {
          event.preventDefault()
          onChange?.(event)
        }}
        type={type}
        inputMode='decimal'
        onKeyDown={(event) => {
          onKeyDown?.(event)
          handleKeyDown(event)
        }}
        {...props}
      />
    )
  }
)

TimePickerInput.displayName = 'TimePickerInput'

interface TimePickerProps {
  date?: Date | null
  onChange?: (date: Date | undefined) => void
  hourCycle?: 12 | 24
  granularity?: Granularity
}

interface TimePickerRef {
  minuteRef: HTMLInputElement | null
  hourRef: HTMLInputElement | null
  secondRef: HTMLInputElement | null
}

const TimePicker = React.forwardRef<TimePickerRef, TimePickerProps>(
  ({ date, onChange, hourCycle = 24, granularity = 'minute' }, ref) => {
    const idPrefix = React.useId()
    const minuteRef = React.useRef<HTMLInputElement>(null)
    const hourRef = React.useRef<HTMLInputElement>(null)
    const secondRef = React.useRef<HTMLInputElement>(null)
    const periodRef = React.useRef<HTMLButtonElement>(null)
    const [period, setPeriod] = React.useState<Period>(
      date && date.getHours() >= 12 ? 'PM' : 'AM'
    )

    React.useEffect(() => {
      if (date) setPeriod(date.getHours() >= 12 ? 'PM' : 'AM')
    }, [date])

    React.useImperativeHandle(
      ref,
      () => ({
        minuteRef: minuteRef.current,
        hourRef: hourRef.current,
        secondRef: secondRef.current,
      }),
      []
    )

    return (
      <div className='flex items-center justify-center gap-2'>
        <Clock className='mr-2 size-4' aria-hidden='true' />
        <TimePickerInput
          picker={hourCycle === 24 ? 'hours' : '12hours'}
          date={date}
          id={`${idPrefix}-hour`}
          aria-label='Hour'
          onDateChange={onChange}
          ref={hourRef}
          period={period}
          onRightFocus={() => minuteRef.current?.focus()}
        />
        {(granularity === 'minute' || granularity === 'second') && (
          <>
            :
            <TimePickerInput
              picker='minutes'
              date={date}
              id={`${idPrefix}-minute`}
              aria-label='Minute'
              onDateChange={onChange}
              ref={minuteRef}
              onLeftFocus={() => hourRef.current?.focus()}
              onRightFocus={() => secondRef.current?.focus()}
            />
          </>
        )}
        {granularity === 'second' && (
          <>
            :
            <TimePickerInput
              picker='seconds'
              date={date}
              id={`${idPrefix}-second`}
              aria-label='Second'
              onDateChange={onChange}
              ref={secondRef}
              onLeftFocus={() => minuteRef.current?.focus()}
              onRightFocus={() => periodRef.current?.focus()}
            />
          </>
        )}
        {hourCycle === 12 && (
          <div className='grid gap-1 text-center'>
            <TimePeriodSelect
              period={period}
              setPeriod={setPeriod}
              date={date}
              onDateChange={(next) => {
                onChange?.(next)
                if (next && next.getHours() >= 12) setPeriod('PM')
                else setPeriod('AM')
              }}
              ref={periodRef}
              onLeftFocus={() =>
                (secondRef.current ?? minuteRef.current)?.focus()
              }
            />
          </div>
        )}
      </div>
    )
  }
)

TimePicker.displayName = 'TimePicker'

export type DateTimePickerProps = {
  value?: Date
  onChange?: (date: Date | undefined) => void
  disabled?: boolean
  /** Show `AM/PM` instead of a 24-hour clock. */
  hourCycle?: 12 | 24
  placeholder?: string
  /**
   * The year range will be `this year + yearRange` and `this year - yearRange`.
   * Default is 50.
   */
  yearRange?: number
  /**
   * Formats follow the `date-fns` documentation.
   * @see https://date-fns.org/docs/format
   */
  displayFormat?: { hour24?: string; hour12?: string }
  /**
   * The smallest unit displayed by the picker. Defaults to `minute`.
   */
  granularity?: Granularity
  className?: string
  /** Id for the trigger button so a `Label` can point at it. */
  id?: string
  'aria-invalid'?: boolean
  'aria-describedby'?: string
  locale?: Locale
  weekStartsOn?: CalendarProps['weekStartsOn']
  showWeekNumber?: CalendarProps['showWeekNumber']
  showOutsideDays?: CalendarProps['showOutsideDays']
}

type DateTimePickerRef = {
  value?: Date
} & Omit<HTMLButtonElement, 'value'>

export const DateTimePicker = React.forwardRef<
  Partial<DateTimePickerRef>,
  DateTimePickerProps
>(
  (
    {
      locale = enUS,
      value,
      onChange,
      hourCycle = 24,
      yearRange = 50,
      disabled = false,
      displayFormat,
      granularity = 'minute',
      placeholder = 'Pick a date',
      className,
      id,
      'aria-invalid': ariaInvalid,
      'aria-describedby': ariaDescribedBy,
      ...props
    },
    ref
  ) => {
    const [month, setMonth] = React.useState<Date>(value ?? new Date())
    const buttonRef = React.useRef<HTMLButtonElement>(null)

    React.useEffect(() => {
      if (value) setMonth(value)
    }, [value])

    // Keep the current time-of-day when the user picks a different day.
    const handleSelect = (newDay: Date | undefined) => {
      if (!newDay) return
      if (!value) {
        onChange?.(newDay)
        setMonth(newDay)
        return
      }
      const next = new Date(newDay)
      next.setHours(value.getHours(), value.getMinutes(), 0, 0)
      onChange?.(next)
      setMonth(next)
    }

    React.useImperativeHandle(
      ref,
      () => ({
        ...buttonRef.current,
        value,
      }),
      [value]
    )

    const initHourFormat = {
      hour24:
        displayFormat?.hour24 ??
        `PPP HH:mm${granularity === 'second' ? ':ss' : ''}`,
      hour12:
        displayFormat?.hour12 ??
        `PP hh:mm${granularity === 'second' ? ':ss' : ''} b`,
    }

    const year = new Date().getFullYear()

    return (
      <Popover>
        <PopoverTrigger asChild disabled={disabled}>
          <Button
            id={id}
            type='button'
            variant='outline'
            aria-invalid={ariaInvalid}
            aria-describedby={ariaDescribedBy}
            className={cn(
              'w-full justify-start text-left font-normal',
              !value && 'text-muted-foreground',
              className
            )}
            ref={buttonRef}
          >
            <CalendarIcon className='mr-2 size-4' aria-hidden='true' />
            {value ? (
              format(
                value,
                hourCycle === 24
                  ? initHourFormat.hour24
                  : initHourFormat.hour12,
                { locale }
              )
            ) : (
              <span>{placeholder}</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className='w-auto p-0'>
          <Calendar
            mode='single'
            selected={value}
            month={month}
            onSelect={handleSelect}
            onMonthChange={handleSelect}
            captionLayout='dropdown'
            startMonth={new Date(year - yearRange, 0)}
            endMonth={new Date(year + yearRange, 11)}
            locale={locale}
            {...props}
          />
          {granularity !== 'day' && (
            <div className='border-t border-border p-3'>
              <TimePicker
                onChange={onChange}
                date={value}
                hourCycle={hourCycle}
                granularity={granularity}
              />
            </div>
          )}
        </PopoverContent>
      </Popover>
    )
  }
)

DateTimePicker.displayName = 'DateTimePicker'

export { TimePickerInput, TimePicker }
export type { TimePickerType }
