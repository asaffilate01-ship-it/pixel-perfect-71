import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

// MealDeck-branded notifications: ivory playing-card style with red edge.
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      offset={88}
      mobileOffset={84}
      toastOptions={{
        classNames: {
          toast: "mealdeck-toast",
          title: "font-display font-bold",
          description: "opacity-70",
          icon: "mealdeck-toast-icon",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
