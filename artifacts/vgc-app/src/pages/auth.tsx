import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useLogin, useRegister, useGetSession } from "@workspace/api-client-react";
import { motion } from "framer-motion";
import { Building, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const registerSchema = z.object({
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  brokerage: z.string().optional(),
});

export default function AuthPage({ defaultTab = "login" }: { defaultTab?: "login" | "register" }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  // Redirect if already logged in
  const { data: session } = useGetSession({ query: { retry: false } });
  if (session) {
    setLocation("/dashboard");
  }

  const loginMutation = useLogin({
    mutation: {
      onSuccess: () => setLocation("/dashboard"),
      onError: (err) => toast({ title: "Login failed", description: err.error, variant: "destructive" })
    }
  });

  const registerMutation = useRegister({
    mutation: {
      onSuccess: () => setLocation("/dashboard"),
      onError: (err) => toast({ title: "Registration failed", description: err.error, variant: "destructive" })
    }
  });

  const loginForm = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" }
  });

  const registerForm = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "", brokerage: "" }
  });

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center relative overflow-hidden">
      <div className="absolute top-0 inset-x-0 h-96 bg-gradient-to-b from-primary/10 to-transparent pointer-events-none" />
      
      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4">
        <Link href="/" className="flex items-center justify-center gap-2 group mb-8">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg">
            <Building className="w-5 h-5 text-white" />
          </div>
          <span className="font-display font-bold text-2xl tracking-tight">Virtual<span className="text-primary">GC</span></span>
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel p-8 rounded-2xl shadow-2xl"
        >
          <Tabs defaultValue={defaultTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-8 bg-black/20">
              <TabsTrigger value="login">Log In</TabsTrigger>
              <TabsTrigger value="register">Register</TabsTrigger>
            </TabsList>
            
            <TabsContent value="login">
              <form onSubmit={loginForm.handleSubmit((d) => loginMutation.mutate({ data: d }))} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <Input id="login-email" type="email" placeholder="agent@brokerage.com" {...loginForm.register("email")} className="bg-black/20" />
                  {loginForm.formState.errors.email && <p className="text-xs text-destructive">{loginForm.formState.errors.email.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Password</Label>
                  <Input id="login-password" type="password" {...loginForm.register("password")} className="bg-black/20" />
                </div>
                <Button type="submit" className="w-full mt-6" disabled={loginMutation.isPending}>
                  {loginMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Sign In
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="register">
              <form onSubmit={registerForm.handleSubmit((d) => registerMutation.mutate({ data: d }))} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reg-name">Full Name</Label>
                  <Input id="reg-name" placeholder="Sarah Agent" {...registerForm.register("name")} className="bg-black/20" />
                  {registerForm.formState.errors.name && <p className="text-xs text-destructive">{registerForm.formState.errors.name.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-email">Email</Label>
                  <Input id="reg-email" type="email" placeholder="sarah@brokerage.com" {...registerForm.register("email")} className="bg-black/20" />
                  {registerForm.formState.errors.email && <p className="text-xs text-destructive">{registerForm.formState.errors.email.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-brokerage">Brokerage (Optional)</Label>
                  <Input id="reg-brokerage" placeholder="Keller Williams" {...registerForm.register("brokerage")} className="bg-black/20" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-password">Password</Label>
                  <Input id="reg-password" type="password" {...registerForm.register("password")} className="bg-black/20" />
                  {registerForm.formState.errors.password && <p className="text-xs text-destructive">{registerForm.formState.errors.password.message}</p>}
                </div>
                <Button type="submit" className="w-full mt-6" disabled={registerMutation.isPending}>
                  {registerMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Create Account
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </motion.div>
      </div>
    </div>
  );
}
