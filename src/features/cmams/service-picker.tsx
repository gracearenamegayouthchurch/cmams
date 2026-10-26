import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { type Service } from './types'

export function ServicePicker({
  services,
  value,
  onChange,
  activeOnly = false,
}: {
  services: Service[]
  value: string
  onChange: (id: string) => void
  activeOnly?: boolean
}) {
  const available = activeOnly
    ? services.filter((service) => service.status === 'CHECKIN_OPEN')
    : services
  return (
    <div className='space-y-2'>
      <Label htmlFor='service-picker'>Service</Label>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger id='service-picker' className='w-full max-w-md'>
          <SelectValue
            placeholder={
              available.length ? 'Select a service' : 'No available services'
            }
          />
        </SelectTrigger>
        <SelectContent>
          {available.map((service) => (
            <SelectItem key={service.id} value={service.id}>
              {service.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
