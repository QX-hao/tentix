import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  Button,
  DescriptionEditor,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useToast,
} from "tentix-ui";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Loader2,
} from "lucide-react";
import { useTranslation } from "i18n";
import { apiClient } from "@lib/api-client";
import { useTicketModules } from "@store/app-config";
import { ticketPriorityEnumArray } from "tentix-server/constants";
import type { JSONContentZod } from "tentix-server/types";
import { useSealos } from "src/_provider/sealos";
import { RouteTransition } from "@comp/page-transition";
import { StaffSidebar } from "@comp/staff/sidebar";
import useDebounce from "@hook/use-debounce";
import { processFilesAndUpload } from "@comp/chat/upload-utils";
import type { TFunction } from "i18next";

const createStaffTicketSchema = (t: TFunction) =>
  z.object({
    customerProviderUserId: z
      .string()
      .trim()
      .min(1, t("customer_id_required"))
      .max(128, t("customer_id_max_length")),
    title: z.string().trim().min(3, t("title_min_length")),
    module: z.string().min(1, t("please_select_module")),
    description: z.any(),
    priority: z.enum(ticketPriorityEnumArray),
  });

type CreateStaffTicketData = z.infer<
  ReturnType<typeof createStaffTicketSchema>
>;

type CustomerItem = {
  id: number;
  providerUserId: string;
  name: string;
  nickname: string;
  realName: string;
};

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
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerPage, setCustomerPage] = useState(1);
  const [customerPageCursors, setCustomerPageCursors] = useState<
    Array<string | undefined>
  >([undefined]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerItem | null>(
    null,
  );
  const form = useForm<CreateStaffTicketData>({
    resolver: zodResolver(createStaffTicketSchema(t)),
    defaultValues: {
      customerProviderUserId: "",
      title: "",
      module: "",
      description: {
        type: "doc",
        content: [{ type: "paragraph", content: [] }],
      },
      priority: ticketPriorityEnumArray[3],
    },
  });
  const debouncedCustomerSearch = useDebounce(customerSearch.trim(), 300);
  const isCustomerSearchPending =
    customerSearch.trim() !== debouncedCustomerSearch;

  const {
    data: customerPageData,
    isFetching: isLoadingCustomers,
    isError: isCustomerListError,
  } = useQuery({
    queryKey: [
      "ticket-customers",
      customerPageCursors[customerPage - 1],
      debouncedCustomerSearch,
    ],
    queryFn: async () => {
      const response = await apiClient.ticket.customers.$get({
        query: {
          keyword: debouncedCustomerSearch || undefined,
          cursor: debouncedCustomerSearch
            ? undefined
            : customerPageCursors[customerPage - 1],
        },
      });
      if (!response.ok) {
        throw new Error(t("customer_list_load_failed"));
      }
      return response.json();
    },
    enabled: customerPickerOpen,
    retry: false,
  });
  const customers = customerPageData?.items ?? [];

  const createTicketMutation = useMutation({
    mutationFn: async ({
      data,
      customerId,
    }: {
      data: CreateStaffTicketData;
      customerId: number;
    }) => {
      const { processedContent } = await processFilesAndUpload(
        data.description as JSONContentZod,
      );
      const response = await apiClient.ticket["create-for-customer"].$post({
        json: {
          customerId,
          title: data.title,
          module: data.module,
          description: processedContent,
          area: isSealos ? sealosArea || "hzh" : "",
          sealosNamespace: isSealos ? sealosNs || "" : "",
          occurrenceTime: new Date().toISOString(),
          priority: data.priority,
        },
      });

      if (!response.ok) {
        const error = (await response.json()) as { message?: string };
        throw new Error(error.message || t("ticket_create_failed"));
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["getAllTickets"] });
      toast({ title: t("ticket_created") });
      navigate({ to: "/staff/tickets/$id", params: { id: data.id } });
    },
    onError: (error: Error) => {
      toast({
        title: t("ticket_create_failed"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CreateStaffTicketData) => {
    if (
      !selectedCustomer ||
      selectedCustomer.providerUserId !== data.customerProviderUserId.trim()
    ) {
      form.setError("customerProviderUserId", {
        message: t("select_valid_customer"),
      });
      return;
    }
    createTicketMutation.mutate({ data, customerId: selectedCustomer.id });
  };

  const selectCustomer = (customer: CustomerItem) => {
    setSelectedCustomer(customer);
    form.setValue("customerProviderUserId", customer.providerUserId, {
      shouldValidate: true,
    });
    setCustomerPickerOpen(false);
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
                aria-label={t("back_to_ticket_list")}
                onClick={() => navigate({ to: "/staff/tickets/list" })}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <h1 className="text-xl font-semibold text-zinc-900">
                {t("create_ticket_for_customer")}
              </h1>
            </div>
            <Button
              type="submit"
              form="staff-create-ticket-form"
              disabled={createTicketMutation.isPending || !selectedCustomer}
            >
              {createTicketMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              {createTicketMutation.isPending
                ? t("creating_ticket")
                : t("create_new_ticket")}
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
                  <Label htmlFor="customerProviderUserId">
                    {t("customer_id")}
                  </Label>
                  <input
                    type="hidden"
                    {...form.register("customerProviderUserId")}
                  />
                  <Popover
                    open={customerPickerOpen}
                    onOpenChange={(open) => {
                      setCustomerPickerOpen(open);
                      if (open) {
                        setCustomerSearch("");
                        setCustomerPage(1);
                        setCustomerPageCursors([undefined]);
                      }
                    }}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        id="customerProviderUserId"
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={customerPickerOpen}
                        className="h-auto min-h-10 w-full justify-between px-3 py-2 font-normal"
                      >
                        {selectedCustomer ? (
                          <span className="min-w-0 text-left">
                            <span className="block truncate text-zinc-900">
                              {selectedCustomer.realName ||
                                selectedCustomer.nickname ||
                                selectedCustomer.name}
                            </span>
                            <span className="block truncate text-xs text-zinc-500">
                              {selectedCustomer.providerUserId}
                            </span>
                          </span>
                        ) : (
                          <span className="text-zinc-500">
                            {t("select_customer")}
                          </span>
                        )}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-zinc-400" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      className="w-[--radix-popover-trigger-width] p-0"
                    >
                      <div className="border-b border-zinc-200 p-2">
                        <Input
                          value={customerSearch}
                          maxLength={128}
                          placeholder={t("customer_id_placeholder")}
                          onChange={(event) => {
                            setCustomerSearch(event.target.value);
                            setCustomerPage(1);
                            setCustomerPageCursors([undefined]);
                          }}
                        />
                      </div>
                      <div className="h-[440px] overflow-y-auto">
                        {isLoadingCustomers || isCustomerSearchPending ? (
                          <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            {t("loading")}
                          </div>
                        ) : isCustomerListError ? (
                          <div className="flex h-full items-center justify-center px-4 text-sm text-red-600">
                            {t("customer_list_load_retry")}
                          </div>
                        ) : customers.length === 0 ? (
                          <div className="flex h-full items-center justify-center px-4 text-sm text-zinc-500">
                            {t("customer_not_found")}
                          </div>
                        ) : (
                          customers.map((customer) => {
                            const displayName =
                              customer.realName ||
                              customer.nickname ||
                              customer.name;
                            const selected =
                              selectedCustomer?.id === customer.id;

                            return (
                              <button
                                key={customer.providerUserId}
                                type="button"
                                className="flex h-11 w-full items-center gap-2 px-3 text-left hover:bg-zinc-100 focus-visible:bg-zinc-100 focus-visible:outline-none"
                                onClick={() => selectCustomer(customer)}
                              >
                                <Check
                                  className={`h-4 w-4 shrink-0 ${selected ? "opacity-100" : "opacity-0"}`}
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm text-zinc-900">
                                    {displayName}
                                  </span>
                                  <span className="block truncate text-xs text-zinc-500">
                                    {customer.providerUserId}
                                  </span>
                                </span>
                              </button>
                            );
                          })
                        )}
                      </div>
                      <div className="flex h-12 items-center justify-center gap-3 border-t border-zinc-200 px-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={t("previous_page")}
                          title={t("previous_page")}
                          disabled={
                            customerPage <= 1 ||
                            isLoadingCustomers ||
                            isCustomerSearchPending
                          }
                          onClick={() =>
                            setCustomerPage((page) => Math.max(1, page - 1))
                          }
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="min-w-16 text-center text-sm text-zinc-600">
                          {t("page_number", { page: customerPage })}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={t("next_page")}
                          title={t("next_page")}
                          disabled={
                            !customerPageData?.hasNext ||
                            isLoadingCustomers ||
                            isCustomerSearchPending
                          }
                          onClick={() => {
                            const lastCustomer = customers.at(-1);
                            if (!lastCustomer) return;

                            setCustomerPageCursors((cursors) => [
                              ...cursors.slice(0, customerPage),
                              lastCustomer.providerUserId,
                            ]);
                            setCustomerPage((page) => page + 1);
                          }}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>
                  {form.formState.errors.customerProviderUserId ? (
                    <p className="text-sm text-red-600">
                      {form.formState.errors.customerProviderUserId.message}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="title">{t("title")}</Label>
                  <Input id="title" {...form.register("title")} />
                  {form.formState.errors.title && (
                    <p className="text-sm text-red-600">
                      {form.formState.errors.title.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="module">{t("module")}</Label>
                  <Controller
                    control={form.control}
                    name="module"
                    render={({ field, fieldState }) => (
                      <>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <SelectTrigger id="module">
                            <SelectValue
                              placeholder={t("please_select_module")}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {ticketModules.map((module) => (
                              <SelectItem key={module.code} value={module.code}>
                                {module.translations[currentLang] ||
                                  module.code}
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
                  <Label htmlFor="priority">{t("priority")}</Label>
                  <Controller
                    control={form.control}
                    name="priority"
                    render={({ field }) => (
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger id="priority">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ticketPriorityEnumArray.map((priority) => (
                            <SelectItem key={priority} value={priority}>
                              {t(priority)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label>{t("desc")}</Label>
                  <Controller
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <DescriptionEditor
                        {...field}
                        value={field.value as JSONContentZod}
                        onChange={(value) =>
                          field.onChange(value as JSONContentZod)
                        }
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
