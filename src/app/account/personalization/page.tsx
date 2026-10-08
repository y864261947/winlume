import ConsolePersonalizationContent from "@/components/console/ConsolePersonalizationContent";
import AccountProfileCard from "@/components/account/AccountProfileCard";

export default function AccountPersonalizationPage() {
  return <ConsolePersonalizationContent profile={<AccountProfileCard />} />;
}
