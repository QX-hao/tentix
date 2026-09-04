import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  Button,
  DescriptionEditor,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useToast,
} from "tentix-ui";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useTranslation } from "i18n";
import { apiClient } from "@lib/api-client";
import { useTicketModules } from "@store/app-config";
import { ticketPriorityEnumArray } from "tentix-server/constants";
import type { JSONContentZod } from "tentix-server/types";
import { useSealos } from "src/_provider/sealos";
import { RouteTransition } from "@comp/page-transition";
import { StaffSidebar } from "@comp/staff/sidebar";

const createStaffTicketSchema = z.object({
  customerId: z.coerce.number().int().positive("请选择客户"),
  title: z.string().trim().min(3, "标题至少需要3个字符"),
  module: z.string().min(1, "请选择模块"),
  description: z.any(),
  priority: z.enum(ticketPriorityEnumArray),
});

type CreateStaffTicketData = z.infer<typeof createStaffTicketSchema>;

export const Route = createFileRoute("/staff/tickets/new")({
  component: RouteComponent,
});

function RouteComponent() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const ticketModules = useTicketModules();
  const { sealosArea, sealosNs, isSealos } = useSealos();
  const currentLang = i18n.language === "zh" ? "zh-CN" : "en-US";

  const { data: customers = [], isLoading: isLoadingCustomers } = useQuery({
    queryKey: ["ticket-customers"],
    queryFn: async () => {
      const response = await apiClient.ticket.customers.$get();
      if (!response.ok) {
        throw new Error("加载客户列表失败");
      }
      return response.json();
    },
  });

  const form = useForm<CreateStaffTicketData>({
    resolver: zodResolver(createStaffTicketSchema),
    defaultValues: {
      customerId: undefined,
      title: "",
      module: "",
      description: {
        type: "doc",
        content: [{ type: "paragraph", content: [] }],
      },
      priority: ticketPriorityEnumArray[3],
    },
  });

  const createTicketMutation = useMutation({
    mutationFn: async (data: CreateStaffTicketData) => {
      const response = await apiClient.ticket["create-for-customer"].$post({
        json: {
          customerId: data.customerId,
          title: data.title,
          module: data.module,
          description: data.description,
          area: isSealos ? sealosArea || "hzh" : "",
          sealosNamespace: isSealos ? sealosNs || "" : "",
          occurrenceTime: new Date().toISOString(),
          priority: data.priority,
        },
      });

      if (!response.ok) {
        const error = (await response.json()) as { message?: string };
        throw new Error(error.message || "创建工单失败");
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["getAllTickets"] });
      toast({ title: "工单创建成功" });
      navigate({ to: "/staff/tickets/$id", params: { id: data.id } });
    },
    onError: (error: Error) => {
      toast({
        title: "工单创建失败",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CreateStaffTicketData) => {
    createTicketMutation.mutate(data);
  };

  return (
    <RouteTransition>
      <div className="flex h-screen w-full overflow-hidden bg-zinc-50">
        <StaffSidebar />
        <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
          <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center justify-between border-b bg-white px-4 sm:px-8">
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="返回工单列表"
                onClick={() => navigate({ to: "/staff/tickets/list" })}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <h1 className="text-xl font-semibold text-zinc-900">
                给客户创建工单
              </h1>
            </div>
            <Button
              type="submit"
              form="staff-create-ticket-form"
              disabled={createTicketMutation.isPending || isLoadingCustomers}
            >
              {createTicketMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              {createTicketMutation.isPending ? "创建中" : "创建工单"}
            </Button>
          </header>

          <form
            id="staff-create-ticket-form"
            onSubmit={form.handleSubmit(onSubmit)}
            className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-8"
          >
            <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-8">
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="customer">客户</Label>
                  <Controller
                    control={form.control}
                    name="customerId"
                    render={({ field, fieldState }) => (
                      <>
                        <Select
                          value={field.value ? String(field.value) : ""}
                          onValueChange={(value) => field.onChange(Number(value))}
                          disabled={isLoadingCustomers}
                        >
                          <SelectTrigger id="customer">
                            <SelectValue
                              placeholder={
                                isLoadingCustomers
                                  ? "加载客户中..."
                                  : "选择客户"
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {customers.map((customer) => (
                              <SelectItem
                                key={customer.id}
                                value={String(customer.id)}
                              >
                                {customer.realName || customer.nickname || customer.name}
                                {customer.name !== customer.realName &&
                                  customer.realName &&
                                  ` (${customer.name})`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {fieldState.error && (
                          <p className="text-sm text-red-600">
                            {fieldState.error.message}
                          </p>
                        )}
                      </>
                    )}
                  />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="title">标题</Label>
                  <Input id="title" {...form.register("title")} />
                  {form.formState.errors.title && (
                    <p className="text-sm text-red-600">
                      {form.formState.errors.title.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="module">模块</Label>
                  <Controller
                    control={form.control}
                    name="module"
                    render={({ field, fieldState }) => (
                      <>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger id="module">
                            <SelectValue placeholder={t("please_select_module")} />
                          </SelectTrigger>
                          <SelectContent>
                            {ticketModules.map((module) => (
                              <SelectItem key={module.code} value={module.code}>
                                {module.translations[currentLang] || module.code}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {fieldState.error && (
                          <p className="text-sm text-red-600">
                            {fieldState.error.message}
                          </p>
                        )}
                      </>
                    )}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="priority">优先级</Label>
                  <Controller
                    control={form.control}
                    name="priority"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger id="priority">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ticketPriorityEnumArray.map((priority) => (
                            <SelectItem key={priority} value={priority}>
                              {priority}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label>描述</Label>
                  <Controller
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <DescriptionEditor
                        {...field}
                        value={field.value as JSONContentZod}
                        onChange={(value) => field.onChange(value as JSONContentZod)}
                        output="json"
                        editable
                        editorContentClassName="min-h-52 overflow-auto"
                        editorClassName="px-3 py-2 focus:outline-none"
                        className="rounded-lg border border-zinc-200"
                      />
                    )}
                  />
                </div>
              </div>
            </div>
          </form>
        </main>
      </div>
    </RouteTransition>
  );
}
